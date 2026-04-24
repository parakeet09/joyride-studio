// Renders the body of a tour tooltip — text, image, video, or iframe.
// Framework-neutral: no design-system imports, no Tailwind.
//
// Generated tour step files construct this component directly so the step's
// `content` is a single ReactNode per Joyride's Step.content.

import type { CSSProperties, ReactNode } from 'react';

interface TourMediaBaseProps {
  /** Plain-text body shown above any media. Optional. */
  body?: ReactNode;
}

interface TourMediaTextProps extends TourMediaBaseProps {
  kind: 'text';
}
interface TourMediaImageProps extends TourMediaBaseProps {
  kind: 'image';
  src: string;
  alt?: string;
}
interface TourMediaVideoProps extends TourMediaBaseProps {
  kind: 'video';
  src: string;
  poster?: string;
}
interface TourMediaIframeProps extends TourMediaBaseProps {
  kind: 'iframe';
  src: string;
  title?: string;
}

type TourMediaProps =
  | TourMediaTextProps
  | TourMediaImageProps
  | TourMediaVideoProps
  | TourMediaIframeProps;

const WRAP_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const BODY_STYLE: CSSProperties = {
  color: 'var(--tour-body-color, var(--tour-text, #0f172a))',
  fontSize: 14,
  lineHeight: 1.55,
};

const MEDIA_WRAP: CSSProperties = {
  marginTop: 12,
  overflow: 'hidden',
  borderRadius: 'var(--tour-media-radius, 6px)',
  border: '1px solid var(--tour-border, rgba(0,0,0,0.08))',
  background: 'var(--tour-media-bg, rgba(0,0,0,0.02))',
};

const MEDIA_CHILD: CSSProperties = {
  display: 'block',
  height: 'auto',
  width: '100%',
};

const IFRAME_WRAP: CSSProperties = {
  ...MEDIA_WRAP,
  aspectRatio: '16 / 9',
};

const IFRAME_CHILD: CSSProperties = {
  height: '100%',
  width: '100%',
  border: 0,
};

function TourMedia(props: TourMediaProps) {
  return (
    <div style={WRAP_STYLE}>
      {props.body && <div style={BODY_STYLE}>{props.body}</div>}

      {props.kind === 'image' && (
        <div style={MEDIA_WRAP}>
          <img src={props.src} alt={props.alt ?? ''} style={MEDIA_CHILD} loading="lazy" />
        </div>
      )}

      {props.kind === 'video' && (
        <div style={MEDIA_WRAP}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={props.src}
            poster={props.poster}
            style={MEDIA_CHILD}
            autoPlay
            loop
            muted
            playsInline
          />
        </div>
      )}

      {props.kind === 'iframe' && (
        <div style={IFRAME_WRAP}>
          <iframe
            src={props.src}
            title={props.title ?? 'Tour step media'}
            style={IFRAME_CHILD}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}

export { TourMedia };
export type { TourMediaProps };
