"use client";

import { Loader2 } from "lucide-react";
import { SummaryCards } from "./components/summary-cards";
import { BackordersAlerts } from "./components/backorders-alerts";
import { BackordersContent } from "./components/backorders-content";
import { BackordersFooter } from "./components/backorders-footer";
import { BackordersPageHeader } from "./components/backorders-page-header";
import { BackordersPageModals } from "./components/backorders-page-modals";
import { BackordersToolbar } from "./components/backorders-toolbar";
import { useBackordersPageController } from "./lib/use-backorders-page-controller";

export default function BackordersPage() {
  const controller = useBackordersPageController();

  if (controller.authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <BackordersAlerts controller={controller} />
      <BackordersPageHeader controller={controller} />
      {controller.summary && <SummaryCards summary={controller.summary} />}
      <BackordersToolbar controller={controller} />
      <BackordersContent controller={controller} />
      <BackordersFooter controller={controller} />
      <BackordersPageModals controller={controller} />
    </div>
  );
}
