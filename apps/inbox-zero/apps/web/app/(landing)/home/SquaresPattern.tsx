export function SquaresPattern() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 -z-10 h-full w-full stroke-gray-200 [mask-image:radial-gradient(100%_100%_at_top_right,white,transparent)]"
      role="img"
    >
      <defs>
        <pattern
          height={200}
          id="83fd4e5a-9d52-42fc-97b6-718e5d7ee527"
          patternUnits="userSpaceOnUse"
          width={200}
          x="50%"
          y={-1}
        >
          <path d="M100 200V.5M.5 .5H200" fill="none" />
        </pattern>
      </defs>
      <svg
        aria-hidden="true"
        className="overflow-visible fill-gray-50"
        x="50%"
        y={-1}
      >
        <path
          d="M-100.5 0h201v201h-201Z M699.5 0h201v201h-201Z M499.5 400h201v201h-201Z M-300.5 600h201v201h-201Z"
          strokeWidth={0}
        />
      </svg>
      <rect
        fill="url(#83fd4e5a-9d52-42fc-97b6-718e5d7ee527)"
        height="100%"
        strokeWidth={0}
        width="100%"
      />
    </svg>
  );
}
