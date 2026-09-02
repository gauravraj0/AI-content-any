// Inline icon set — no icon package, single <Icon name="..." /> entry point.
const paths = {
  spark: "M12 3.2c1 5.2 3.6 8 8.8 8.8-5.2 1-7.8 3.6-8.8 8.8-1-5.2-3.6-8-8.8-8.8 5.2-.8 7.8-3.6 8.8-8.8Z",
  doc: "M7 3h7l4 4v14H7V3Zm7 0v4h4M9.5 12h6M9.5 15.5h6",
  pen: "M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Zm11.5-13.5 2 2",
  hash: "M6 9h13M5 15h13M10 4 8 20m7-16-2 16",
  image: "M4 5h16v14H4V5Zm0 10 5-5 4 4 3-2 4 4M9 9.5a1 1 0 1 1-.1 0",
  scan: "M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M4 12h16",
  swap: "M4 8h13m0 0-3.5-3.5M17 8l-3.5 3.5M20 16H7m0 0 3.5-3.5M7 16l3.5 3.5",
  compress: "M9 4v5H4m16 6h-5v5M4 9l5 5m6 1 5 5",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 4 4",
  grid: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  bolt: "M13 3 5 14h5l-1 7 8-11h-5l1-7Z",
  chart: "M4 20V9m5 11V5m5 15v-7m5 7V8M3 21h18",
  wallet: "M3 7h13a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Zm0 0 0-2a2 2 0 0 1 2-2h9m-1 8h.01",
  gear: "M12 9a3 3 0 1 0 .1 0Zm8 3-1.6-.6.5-1.9-1.4-1.4-1.9.5L14 6.6 14.5 5l-1.9-.5L11.2 3H10l-.6 1.9L7.4 4.5 7 6.4 5.4 7 5.9 9 4 9.5l.5 2H3l.5 2 1.9.5-.5 1.9 1.4 1.4 1.9-.5.6 1.8h2.2l.6-1.8 1.9.5 1.4-1.4-.5-1.9 1.8-.6.5-1.9Z",
  users: "M8 11a3 3 0 1 0 .1 0Zm-5 8a5 5 0 0 1 10 0M16 11.5a2.6 2.6 0 1 0 0-5M14 19h6a4.4 4.4 0 0 0-3-4",
  clock: "M12 4a8 8 0 1 0 .1 0Zm0 3.5V12l3 2",
  folder: "M4 6h5l2 2h9v11H4V6Z",
  check: "m5 13 4.5 4.5L19 7",
  x: "m6 6 12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h13m0 0-5-5m5 5-5 5",
  arrowUp: "M12 19V5m0 0-6 6m6-6 6 6",
  download: "M12 4v10m0 0 4-4m-4 4-4-4M4 18h16",
  copy: "M9 9h10v11H9V9Zm-4 6H4V4h11v1",
  star: "m12 4 2.4 5.1 5.6.7-4.1 3.9 1 5.5-4.9-2.7-4.9 2.7 1-5.5L4 9.8l5.6-.7L12 4Z",
  heart: "M12 20s-7-4.3-7-9.2A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.8C19 15.7 12 20 12 20Z",
  filter: "M4 6h16M7 12h10M10 18h4",
  logout: "M14 4h5v16h-5M4 12h10m0 0-3-3m3 3-3 3",
  bell: "M6 10a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Zm4 8a2 2 0 0 0 4 0",
  eye: "M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Zm9.5 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  shield: "M12 3.5 5 6v6c0 4.5 3 7.2 7 8.5 4-1.3 7-4 7-8.5V6l-7-2.5Z",
  code: "m9 8-4 4 4 4m6-8 4 4-4 4",
  globe: "M12 4a8 8 0 1 0 .1 0Zm-8 8h16M12 4c2.5 2.5 2.5 13 0 16M12 4c-2.5 2.5-2.5 13 0 16",
  wand: "m5 19 9-9m4.5-4.5-1 1M15 5l1 1m3 3 1 1M13 3l.7 1.6L15.3 5l-1.6.7L13 7.3l-.7-1.6L10.7 5l1.6-.4L13 3Z",
  layers: "m12 3 8 4.5-8 4.5L4 7.5 12 3Zm8 8.5L12 16 4 11.5M20 16 12 20.5 4 16",
  quote: "M9 6c-2.5 1-4 3-4 6v6h6v-6H7c0-2 1-3.4 3-4l-1-2Zm10 0c-2.5 1-4 3-4 6v6h6v-6h-4c0-2 1-3.4 3-4l-1-2Z",
  play: "M8 5.5 18 12 8 18.5v-13Z",
  trash: "M5 7h14M9 7V5h6v2m-8 0 1 13h6l1-13",
  edit: "M5 19h4l9-9-4-4-9 9v4Zm11-13 3 3",
  link: "M10 14a4 4 0 0 0 6 .5l2-2a4 4 0 0 0-5.7-5.7l-1 1m-1.3 6.7a4 4 0 0 1-6-.5L4 12a4 4 0 0 1 5.7-5.7l1-1",
  refresh: "M20 12a8 8 0 1 1-3-6.2M20 4v5h-5",
  menu: "M4 7h16M4 12h16M4 17h16",
  pin: "M9 4h6l-1 6 3 3H7l3-3-1-6Zm3 12v4",
  gauge: "M12 20a8 8 0 1 1 8-8m-8 8 4-6",
  flag: "M6 4v16m0-13h11l-2 3.5L17 15H6",
};

export default function Icon({ name, size = 18, strokeWidth = 1.6, fill = false, className = "", style }) {
  const d = paths[name] || paths.spark;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

export const KIND_ICON = {
  blog: "doc", text: "pen", caption: "hash", image: "image", rewrite: "swap",
  summarize: "compress", seo: "search", analyze: "scan", manual: "edit",
};
export const KIND_COLOR = {
  blog: "#7c5cff", text: "#f7b955", caption: "#ff6bc4", image: "#ff9b6b",
  rewrite: "#5ce6a4", summarize: "#8fb4ff", seo: "#c8ff5c", analyze: "#22d3ee", manual: "#a9b0c6",
};
