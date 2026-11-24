import { images } from "../images.js";

/**
 * <picture> with AVIF + WebP sources, real width/height (no layout shift), a dominant-color and
 * tiny blurred placeholder painted underneath, lazy loading by default and `priority` for the hero.
 */
export default function ResponsiveImage({ name, alt = "", sizes = "100vw", priority = false, className = "", imgClassName = "", style }) {
  const meta = images[name];
  if (!meta) return null;
  const srcset = (ext) => meta.widths.map((width) => `${url(name, width, meta.width, ext)} ${width}w`).join(", ");
  return (
    <picture
      className={`block overflow-hidden ${className}`}
      style={{
        backgroundColor: meta.color,
        backgroundImage: `url("${meta.placeholder}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        ...style,
      }}
    >
      <source type="image/avif" srcSet={srcset("avif")} sizes={sizes} />
      <source type="image/webp" srcSet={srcset("webp")} sizes={sizes} />
      <img
        src={url(name, meta.width, meta.width, "webp")}
        alt={alt}
        width={meta.width}
        height={meta.height}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? undefined : "async"}
        fetchPriority={priority ? "high" : "auto"}
        className={`h-full w-full object-cover ${imgClassName}`}
      />
    </picture>
  );
}

function url(name, width, fullWidth, ext) {
  return width === fullWidth ? `/images/${name}.${ext}` : `/images/${name}-${width}.${ext}`;
}
