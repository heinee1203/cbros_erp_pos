"use client";

import { Loader2 } from "lucide-react";
import { DailyBreakdownTable } from "./components/daily-breakdown-table";
import { GrossSalesChart } from "./components/gross-sales-chart";
import { ReportsFilterBar } from "./components/reports-filter-bar";
import { ReportsKpiGrid } from "./components/reports-kpi-grid";
import { ReportsOverviewHeader } from "./components/reports-overview-header";
import { TopEmployeesTable } from "./components/top-employees-table";
import { TopItemsTable } from "./components/top-items-table";
import { useReportsOverviewController } from "./lib/use-reports-overview-controller";

export default function ReportsOverviewPage() {
  const reports = useReportsOverviewController();

  if (reports.authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 pb-8">
      <ReportsOverviewHeader />

      <ReportsFilterBar
        range={reports.range}
        preset={reports.preset}
        customFrom={reports.customFrom}
        customTo={reports.customTo}
        selectedLocation={reports.selectedLocation}
        selectedEmployee={reports.selectedEmployee}
        currentLocationId={reports.currentLocationId}
        locations={reports.locations}
        employees={reports.employees}
        onNavigateRange={reports.navigateRange}
        onApplyPreset={reports.applyPreset}
        onCustomRangeChange={reports.setCustomRange}
        onSelectedLocationChange={reports.setSelectedLocation}
        onSelectedEmployeeChange={reports.setSelectedEmployee}
      />

      <ReportsKpiGrid kpis={reports.kpis} isLoading={reports.isDataLoading} />

      <GrossSalesChart
        chartData={reports.chartData}
        range={reports.range}
        isLoading={reports.isDataLoading}
        onTryAllLocations={reports.tryAllLocations}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <TopItemsTable
          items={reports.topItems}
          isLoading={reports.itemsLoading}
          sortBy={reports.topItemsSort}
          onSortChange={(sort) => reports.setTopItemsSort(sort)}
        />
        <TopEmployeesTable
          employees={reports.topEmployees}
          isLoading={reports.employeesReportLoading}
        />
      </div>

      <DailyBreakdownTable
        days={reports.days}
        totals={reports.totals}
        totalMargin={reports.totalMargin}
        range={reports.range}
        isLoading={reports.isDataLoading}
        onTryAllLocations={reports.tryAllLocations}
      />
    </div>
  );
}
