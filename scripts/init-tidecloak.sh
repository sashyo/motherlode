#!/bin/bash
# init-tidecloak.sh — Bootstrap TideCloak dev instance for Motherlode
#
# Run via: npm run init
#
# Steps:
#   1. Start TideCloak dev container (Docker required)
#   2. Create realm + client from templates/realm.json.template
#   3. Initialize Tide licensing + IGA
#   4. Create admin user with tide-realm-admin role
#   5. Print invite link (interactive — open in your browser)
#   6. Wait for account linking
#   7. Approve all change-sets
#   8. Configure CustomAdminUIDomain
#   9. Export data/tidecloak.json
#
# Prerequisites: docker, curl, jq
# Override defaults via env: TIDECLOAK_URL, REALM_NAME, CLIENT_NAME, CLIENT_APP_URL, ADMIN_EMAIL

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

TIDECLOAK_URL="${TIDECLOAK_URL:-http://localhost:8080}"
REALM_NAME="${REALM_NAME:-motherlode}"
CLIENT_NAME="${CLIENT_NAME:-motherlode-client}"
CLIENT_APP_URL="${CLIENT_APP_URL:-http://localhost:3000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-info@tide.org}"
ADAPTER_OUTPUT="${ADAPTER_OUTPUT:-$PROJECT_DIR/data/tidecloak.json}"
TIDECLOAK_IMAGE="${TIDECLOAK_IMAGE:-tideorg/tidecloak-dev:latest}"

get_token() {
  curl -s -X POST "$TIDECLOAK_URL/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=admin&password=password&grant_type=password&client_id=admin-cli" \
    | jq -r '.access_token'
}

approve_and_commit() {
  local TYPE=$1
  local TOKEN
  TOKEN="$(get_token)"
  local requests
  requests=$(curl -s "$TIDECLOAK_URL/admin/realms/$REALM_NAME/tide-admin/change-set/$TYPE/requests" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "[]")

  echo "$requests" | jq -c '.[]' 2>/dev/null | while read -r req; do
    local id cst at payload
    id=$(echo "$req" | jq -r .draftRecordId)
    cst=$(echo "$req" | jq -r .changeSetType)
    at=$(echo "$req" | jq -r .actionType)
    payload="{\"changeSetId\":\"$id\",\"changeSetType\":\"$cst\",\"actionType\":\"$at\"}"

    TOKEN="$(get_token)"
    curl -s -X POST "$TIDECLOAK_URL/admin/realms/$REALM_NAME/tide-admin/change-set/sign" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" -d "$payload" > /dev/null

    curl -s -X POST "$TIDECLOAK_URL/admin/realms/$REALM_NAME/tide-admin/change-set/commit" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" -d "$payload" > /dev/null
  done
}

for cmd in docker curl jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: $cmd is required but not found."
    exit 1
  fi
done

echo "==> Cleaning previous state..."
docker stop tidecloak 2>/dev/null || true
docker rm tidecloak 2>/dev/null || true
mkdir -p "$PROJECT_DIR/data"
rm -f "$PROJECT_DIR/data/keycloakdb"* 2>/dev/null || true
# UID/GID 1000:1000 already matches the TideCloak container — no chown needed.

if lsof -i :8080 >/dev/null 2>&1; then
  echo "ERROR: Port 8080 is already in use."
  exit 1
fi

echo "==> Starting TideCloak ($TIDECLOAK_IMAGE)..."
docker run -d --name tidecloak \
  -v "$PROJECT_DIR/data:/opt/keycloak/data/h2" \
  -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=password \
  "$TIDECLOAK_IMAGE"

echo "==> Waiting for TideCloak to start..."
for i in {1..24}; do
  curl -sf "$TIDECLOAK_URL" > /dev/null 2>&1 && break
  echo "  Attempt $i/24..."
  sleep 5
done

if ! curl -sf "$TIDECLOAK_URL" > /dev/null 2>&1; then
  echo "ERROR: TideCloak did not start within 120 seconds. Run: docker logs tidecloak"
  exit 1
fi
echo "  TideCloak is ready."

echo "==> Creating realm '$REALM_NAME'..."
TMP_REALM="$(mktemp)"
cp "$SCRIPT_DIR/realm.json.template" "$TMP_REALM"
sed -i "s|REALM_NAME|$REALM_NAME|g" "$TMP_REALM"
sed -i "s|CLIENT_NAME|$CLIENT_NAME|g" "$TMP_REALM"
sed -i "s|CLIENT_APP_URL|$CLIENT_APP_URL|g" "$TMP_REALM"

TOKEN="$(get_token)"
REALM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$TIDECLOAK_URL/admin/realms" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @"$TMP_REALM")
rm -f "$TMP_REALM"

if [[ ! "$REALM_STATUS" =~ ^2 ]]; then
  echo "ERROR: Realm import failed (HTTP $REALM_STATUS)."
  echo "If the realm already exists, wipe the DB: sudo rm -f ./data/keycloakdb*"
  exit 1
fi
echo "    Realm created."

echo "==> Initializing Tide realm (license + VRK)..."
TOKEN="$(get_token)"
curl -s -X POST "$TIDECLOAK_URL/admin/realms/$REALM_NAME/vendorResources/setUpTideRealm" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "email=$ADMIN_EMAIL" \
  --data-urlencode "isRagnarokEnabled=true" > /dev/null

echo "==> Enabling IGA..."
TOKEN="$(get_token)"
curl -s -X POST "$TIDECLOAK_URL/admin/realms/$REALM_NAME/tide-admin/toggle-iga" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "isIGAEnabled=true" > /dev/null

echo "==> Approving client change requests..."
sleep 2
approve_and_commit clients

echo "==> Creating admin user..."
TOKEN="$(get_token)"
curl -s -X POST "$TIDECLOAK_URL/admin/realms/$REALM_NAME/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"email\":\"$ADMIN_EMAIL\",\"firstName\":\"Admin\",\"lastName\":\"User\",\"enabled\":true}"

echo "==> Approving user change requests..."
sleep 2
approve_and_commit users

TOKEN="$(get_token)"
USER_ID=$(curl -s "$TIDECLOAK_URL/admin/realms/$REALM_NAME/users?username=admin" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

if [ -z "$USER_ID" ] || [ "$USER_ID" = "null" ]; then
  echo "ERROR: Could not find admin user after creation. Check change-set approval."
  exit 1
fi

echo "==> Assigning tide-realm-admin role..."
TOKEN="$(get_token)"
CLIENT_UUID=$(curl -s "$TIDECLOAK_URL/admin/realms/$REALM_NAME/clients?clientId=realm-management" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

if [ -z "$CLIENT_UUID" ] || [ "$CLIENT_UUID" = "null" ]; then
  echo "ERROR: realm-management client not found."
  exit 1
fi

ROLE_JSON=$(curl -s "$TIDECLOAK_URL/admin/realms/$REALM_NAME/clients/$CLIENT_UUID/roles/tide-realm-admin" \
  -H "Authorization: Bearer $TOKEN")

if echo "$ROLE_JSON" | jq -e '.error' > /dev/null 2>&1; then
  echo "ERROR: tide-realm-admin role not found: $ROLE_JSON"
  exit 1
fi

TOKEN="$(get_token)"
curl -s -X POST "$TIDECLOAK_URL/admin/realms/$REALM_NAME/users/$USER_ID/role-mappings/clients/$CLIENT_UUID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "[$ROLE_JSON]" > /dev/null

echo "==> Generating invite link..."
TOKEN="$(get_token)"
INVITE_LINK=$(curl -s -X POST \
  "$TIDECLOAK_URL/admin/realms/$REALM_NAME/tideAdminResources/get-required-action-link?userId=$USER_ID&lifespan=43200" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '["link-tide-account-action"]')

echo ""
echo "============================================"
echo "Open this link in your browser to link your admin Tide account:"
echo "$INVITE_LINK"
echo "============================================"
echo ""

echo "Waiting for admin to link Tide account (polling every 5s)..."
while true; do
  TOKEN="$(get_token)"
  KEY=$(curl -s "$TIDECLOAK_URL/admin/realms/$REALM_NAME/users?username=admin" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.[0].attributes.tideUserKey[0] // empty')
  [ -n "$KEY" ] && echo "  Account linked." && break
  sleep 5
done

echo "==> Approving role/user change requests..."
sleep 2
approve_and_commit users
approve_and_commit roles
approve_and_commit clients

echo "==> Configuring CustomAdminUIDomain..."
TOKEN="$(get_token)"
INST=$(curl -s "$TIDECLOAK_URL/admin/realms/$REALM_NAME/identity-provider/instances/tide" \
  -H "Authorization: Bearer $TOKEN")
UPDATED=$(echo "$INST" | jq --arg d "$CLIENT_APP_URL" '.config.CustomAdminUIDomain=$d')
curl -s -X PUT "$TIDECLOAK_URL/admin/realms/$REALM_NAME/identity-provider/instances/tide" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d "$UPDATED" > /dev/null

curl -s -X POST "$TIDECLOAK_URL/admin/realms/$REALM_NAME/vendorResources/sign-idp-settings" \
  -H "Authorization: Bearer $TOKEN" > /dev/null

echo "==> Exporting adapter config..."
TOKEN="$(get_token)"
CLIENT_UUID=$(curl -s "$TIDECLOAK_URL/admin/realms/$REALM_NAME/clients?clientId=$CLIENT_NAME" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

mkdir -p "$(dirname "$ADAPTER_OUTPUT")"
curl -s "$TIDECLOAK_URL/admin/realms/$REALM_NAME/vendorResources/get-installations-provider?clientId=$CLIENT_UUID&providerId=keycloak-oidc-keycloak-json" \
  -H "Authorization: Bearer $TOKEN" > "$ADAPTER_OUTPUT"

if jq -e 'has("jwk") and has("vendorId") and has("homeOrkUrl")' "$ADAPTER_OUTPUT" > /dev/null 2>&1; then
  echo ""
  echo "============================================"
  echo "Init complete!"
  echo ""
  echo "  Adapter config: $ADAPTER_OUTPUT"
  echo "  TideCloak:      $TIDECLOAK_URL"
  echo "  Realm:          $REALM_NAME"
  echo "  Client:         $CLIENT_NAME"
  echo ""
  echo "  Next: npm run dev"
  echo "============================================"
else
  echo ""
  echo "WARNING: Adapter config exported but may be missing Tide extensions."
  echo "Check: jq 'has(\"jwk\")' $ADAPTER_OUTPUT"
fi
