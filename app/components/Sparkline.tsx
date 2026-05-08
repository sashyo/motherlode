type Props = {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
};

export default function Sparkline({
  data,
  width = 600,
  height = 120,
  stroke = "#00f0ff",
  fill = "rgba(0, 240, 255, 0.12)",
}: Props) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * (height - 8) - 4;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");

  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full h-32"
      aria-hidden
    >
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.45" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
        <pattern id="spark-grid" width="40" height="20" patternUnits="userSpaceOnUse">
          <path d="M40 0 L0 0 0 20" stroke="rgba(0,240,255,0.07)" strokeWidth="0.5" fill="none" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#spark-grid)" />
      <path d={areaPath} fill="url(#spark-grad)" />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        style={{ filter: `drop-shadow(0 0 4px ${stroke})` }}
      />
      {points.length > 0 && (
        <circle
          cx={points[points.length - 1][0]}
          cy={points[points.length - 1][1]}
          r="3"
          fill={stroke}
          style={{ filter: `drop-shadow(0 0 6px ${stroke})` }}
        />
      )}
    </svg>
  );
}
