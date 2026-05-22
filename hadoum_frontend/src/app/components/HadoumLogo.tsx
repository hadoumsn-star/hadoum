import image_logo_1 from '@/imports/logo-1.png'
import logoSrc from '../../imports/logo.png';

interface HadoumLogoProps {
  size?: 'small' | 'default' | 'large' | 'xlarge';
  variant?: 'full' | 'mark-only';
  onDark?: boolean;
  style?: React.CSSProperties;
}

// Heights drive the sizing — width adjusts naturally to preserve aspect ratio
const HEIGHTS: Record<string, { mark: number; full: number }> = {
  small:   { mark: 28, full: 32 },
  default: { mark: 36, full: 40 },
  large:   { mark: 48, full: 52 },
  xlarge:  { mark: 60, full: 68 },
};

export function HadoumLogo({
  size = 'default',
  variant = 'full',
  onDark = false,
  style: styleProp,
}: HadoumLogoProps) {
  const h = HEIGHTS[size];

  if (variant === 'mark-only') {
    return (
      <div
        style={{
          width: h.mark,
          height: h.mark,
          borderRadius: '50%',
          overflow: 'hidden',
          flexShrink: 0,
          ...styleProp,
        }}
        aria-label="Orphelinat Hadoum"
        role="img"
      >
        <img
          src={logoSrc}
          alt=""
          style={{
            width: '100%',
            height: '130%',
            objectFit: 'cover',
            objectPosition: 'top center',
            display: 'block',
            filter: onDark ? 'brightness(0) invert(1)' : 'none',
          }}
        />
      </div>
    );
  }

  return (
    <img
      src={image_logo_1}
      alt="Orphelinat Hadoum"
      style={{
        height: h.full,
        width: 'auto',
        maxWidth: '100%',
        display: 'block',
        flexShrink: 0,
        objectFit: 'contain',
        filter: onDark ? 'brightness(0) invert(1)' : 'none',
        ...styleProp,
      }}
    />
  );
}