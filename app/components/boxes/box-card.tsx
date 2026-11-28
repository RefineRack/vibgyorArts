"use client";

import Link from "next/link";
import { formatSize } from "@/lib/box-dimensions";
import type { DielineScene } from "@/lib/dieline-types";
import { DielineThumbnail } from "@/app/components/boxes/dieline-thumbnail";

type BoxCardProps = {
  href: string;
  name: string;
  length: number;
  width: number;
  height: number;
  scene?: DielineScene;
  image?: string;
};

export function BoxCard({ href, name, length, width, height, scene, image }: BoxCardProps) {
  const size = formatSize({ length, width, height });
  return (
    <Link className="va-card" href={href}>
      {scene ? (
        <DielineThumbnail scene={scene} title={name} />
      ) : (
        <div className="va-thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {image ? <img src={image} alt="" /> : null}
        </div>
      )}
      <span>{name}</span>
      {size ? <small>{size}</small> : null}
    </Link>
  );
}
