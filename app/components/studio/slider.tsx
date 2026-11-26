"use client";

import { useRef } from "react";

type SliderProps = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  origin?: number;
};

export function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  origin,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const span = max - min;
  const ratio = span === 0 ? 0 : (value - min) / span;

  function valueFromClientX(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return value;
    const nextRatio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const raw = min + nextRatio * span;
    const snapped = Math.round(raw / step) * step;
    return Math.min(max, Math.max(min, Number(snapped.toFixed(4))));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    onChange(valueFromClientX(event.clientX));
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    onChange(valueFromClientX(event.clientX));
  }

  const fill =
    origin === undefined
      ? { left: "0%", width: `${ratio * 100}%` }
      : (() => {
          const originRatio = span === 0 ? 0 : (origin - min) / span;
          const left = Math.min(originRatio, ratio);
          const right = Math.max(originRatio, ratio);
          return { left: `${left * 100}%`, width: `${(right - left) * 100}%` };
        })();

  return (
    <div
      ref={trackRef}
      className="va-slider"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          onChange(Math.min(max, Number((value + step).toFixed(4))));
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          onChange(Math.max(min, Number((value - step).toFixed(4))));
        }
      }}
    >
      <span className="va-slider-line" />
      <span className="va-slider-fill" style={fill} />
      <span className="va-slider-thumb" style={{ left: `${ratio * 100}%` }} />
    </div>
  );
}
