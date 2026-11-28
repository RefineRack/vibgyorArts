"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Summer } from "@/app/components/studio/summer";

type AppShellProps = {
  title: string;
  backHref?: string;
  talking?: boolean;
  lockPortrait?: boolean;
  children: ReactNode;
};

export function AppShell({ title, backHref, talking = false, lockPortrait = false, children }: AppShellProps) {
  return (
    <>
      {lockPortrait ? <div className="va-rotate">Turn the phone upright. This studio is portrait.</div> : null}
      <div className={lockPortrait ? "va-device is-portrait-locked" : "va-device"}>
        <header className="va-top">
          <div className="va-top-inner">
            <Link href="/boxes" className="va-logo-link" aria-label="Vibgyor Arts, your boxes">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="va-logo" src="/logo.jpeg" alt="" width={40} height={40} />
            </Link>
            <div className="va-title">
              <p className="va-brand">Vibgyor Arts</p>
              <h1>{title}</h1>
            </div>
            {backHref ? (
              <Link className="va-back" href={backHref}>
                Boxes
              </Link>
            ) : null}
            <Summer talking={talking} />
          </div>
        </header>
        <div className="va-body">{children}</div>
      </div>
    </>
  );
}
