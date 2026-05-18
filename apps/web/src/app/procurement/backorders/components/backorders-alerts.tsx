import { AlertTriangle, Check, X } from "lucide-react";
import type { BackordersPageController } from "../lib/use-backorders-page-controller";

type BackordersAlertsProps = {
  controller: BackordersPageController;
};

export function BackordersAlerts({ controller }: BackordersAlertsProps) {
  return (
    <>
      {controller.successMsg && (
        <div className="flex items-center gap-2 border-b border-green-200 bg-green-50 px-6 py-1.5 text-sm text-green-800">
          <Check size={14} />
          {controller.successMsg}
          <button onClick={() => controller.setSuccessMsg(null)} className="ml-auto">
            <X size={14} />
          </button>
        </div>
      )}

      {controller.error && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-6 py-1.5 text-sm text-red-800">
          <AlertTriangle size={14} />
          {controller.error}
          <button onClick={() => controller.setError(null)} className="ml-auto">
            <X size={14} />
          </button>
        </div>
      )}
    </>
  );
}
