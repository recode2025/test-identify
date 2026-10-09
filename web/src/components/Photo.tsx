import { CSSProperties, useEffect, useState } from 'react';
import { UserOutlined } from '@ant-design/icons';
import { photoUrl } from '../lib/api';

interface Props {
  studentNo: string;
  version: string | null;
  size: 'thumb' | 'medium';
  width: number | string;
  height: number | string;
  eager?: boolean;
  radius?: number;
  style?: CSSProperties;
  onClick?: () => void;
}

/**
 * Fixed-size box so the list never reflows while images stream in; lazy + async decode
 * for long lists, a neutral placeholder while loading, and no request at all when the
 * student has no photo.
 */
export function Photo({ studentNo, version, size, width, height, eager, radius = 6, style, onClick }: Props) {
  const src = photoUrl(size, studentNo, version);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  useEffect(() => setState('loading'), [src]);

  const box: CSSProperties = {
    width,
    height,
    borderRadius: radius,
    overflow: 'hidden',
    background: 'var(--photo-bg)',
    position: 'relative',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...style,
  };

  if (!src || state === 'error') {
    return (
      <div style={box} onClick={onClick}>
        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, lineHeight: 1.4 }}>
          <UserOutlined style={{ fontSize: typeof height === 'number' && height < 80 ? 18 : 40 }} />
          {typeof height !== 'number' || height >= 80 ? <div>{src ? '照片加载失败' : '暂无照片'}</div> : null}
        </div>
      </div>
    );
  }
  return (
    <div style={box} onClick={onClick}>
      {state === 'loading' && <div className="photo-shimmer" />}
      <img
        src={src}
        alt={studentNo}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={eager ? 'high' : 'auto'}
        draggable={false}
        onLoad={() => setState('ok')}
        onError={() => setState('error')}
        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: state === 'ok' ? 1 : 0, transition: 'opacity .15s' }}
      />
    </div>
  );
}

const preloaded = new Set<string>();
/** Warms the browser cache for photos the user is likely to open next. */
export function preloadPhotos(items: { studentNo: string; photoVersion: string | null }[]) {
  for (const it of items) {
    const src = photoUrl('medium', it.studentNo, it.photoVersion);
    if (!src || preloaded.has(src)) continue;
    preloaded.add(src);
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
  }
}
