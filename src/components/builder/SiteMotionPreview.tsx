import { motion, useScroll, useTransform } from "framer-motion";
import { useMemo, useRef } from "react";
import type { SiteBlock, SiteSchema } from "@/lib/site-schema";
import {
  applySiteImageFallbacks,
  mergeSiteBlocks,
  siteBlockInnerHtml,
  sitePreviewStyles,
} from "@/lib/site-render";

const ease = [0.16, 1, 0.3, 1] as const;

function motionDuration(block: SiteBlock): number {
  const d = block.animation?.duration;
  if (d == null || Number.isNaN(d)) return 0.65;
  return d > 10 ? d / 1000 : d;
}

function ParallaxSection({
  html,
  className,
  containerRef,
}: {
  html: string;
  className: string;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const blockRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    container: containerRef,
    target: blockRef,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [56, -56]);
  return (
    <motion.div ref={blockRef} className={className} style={{ y }}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </motion.div>
  );
}

function AnimatedBlock({
  block,
  index,
  containerRef,
}: {
  block: SiteBlock;
  index: number;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const inner = siteBlockInnerHtml(block, index);
  const duration = motionDuration(block);
  const transition = { duration, ease };
  const viewport = { once: true, amount: 0.25 as const };
  const kind = block.animation?.type ?? "fade-in";
  const cls = `block ${block.type}`;

  if (kind === "parallax") {
    return <ParallaxSection html={inner} className={cls} containerRef={containerRef} />;
  }

  if (kind === "fade-in") {
    return (
      <motion.div
        className={cls}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={viewport}
        transition={transition}
        dangerouslySetInnerHTML={{ __html: inner }}
      />
    );
  }

  if (kind === "slide-up") {
    return (
      <motion.div
        className={cls}
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={viewport}
        transition={transition}
        dangerouslySetInnerHTML={{ __html: inner }}
      />
    );
  }

  if (kind === "scale") {
    return (
      <motion.div
        className={cls}
        initial={{ opacity: 0, scale: 0.94 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={viewport}
        transition={transition}
        dangerouslySetInnerHTML={{ __html: inner }}
      />
    );
  }

  return (
    <motion.div
      className={cls}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={viewport}
      transition={transition}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

export function SiteMotionPreview({ site, width }: { site: SiteSchema; width: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const displaySite = useMemo(() => applySiteImageFallbacks(site), [site]);
  const blocks = useMemo(() => mergeSiteBlocks(displaySite), [displaySite]);
  const css = useMemo(() => sitePreviewStyles(displaySite), [displaySite]);

  return (
    <div
      ref={scrollRef}
      className="site-motion-preview isolate h-full overflow-auto rounded-xl border border-border/40 bg-[var(--panel)]/30 shadow-xl"
      style={{ width, minHeight: "100%" }}
    >
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="page">
        {blocks.map((b, i) => (
          <AnimatedBlock key={`${b.type}-${i}`} block={b} index={i} containerRef={scrollRef} />
        ))}
      </div>
    </div>
  );
}
