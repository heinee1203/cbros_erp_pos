"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/app/auth-context";
import {
  useDailySalesSummaryQuery,
  useEmployeesQuery,
  useLocationsQuery,
  useSalesByEmployeeQuery,
  useSalesByItemQuery,
  useSalesKPIsQuery,
  type DashboardFilters,
  type DailySalesRow,
  type ReportFilters,
} from "@/hooks/use-sales-reports";
import type { DailyTotals, ReportsOverviewController, ReportsPreset, TopItemsSort } from "../types";
import { addDays, daysBetween, getDefaultRange, startOfMonth, toISO } from "../utils";

export function useReportsOverviewController(): ReportsOverviewController {
  const { token, locationId, loading } = useAuth();

  const [range, setRange] = useState(getDefaultRange);
  const [preset, setPreset] = useState<ReportsPreset>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [topItemsSort, setTopItemsSort] = useState<TopItemsSort>("revenue");

  const effectiveLocationId = selectedLocation || locationId;
  const isAllLocations = selectedLocation === "__all__";

  const filters: DashboardFilters = useMemo(
    () => ({
      from: toISO(range.from),
      to: toISO(range.to),
      allLocations: isAllLocations || undefined,
      employeeId: selectedEmployee || undefined,
    }),
    [range.from, range.to, isAllLocations, selectedEmployee],
  );

  const priorFilters: DashboardFilters = useMemo(() => {
    const duration = daysBetween(range.from, range.to) + 1;
    return {
      from: toISO(addDays(range.from, -duration)),
      to: toISO(addDays(range.to, -duration)),
      allLocations: isAllLocations || undefined,
      employeeId: selectedEmployee || undefined,
    };
  }, [range.from, range.to, isAllLocations, selectedEmployee]);

  const reportFilters: ReportFilters = useMemo(
    () => ({
      from: toISO(range.from),
      to: toISO(range.to),
      allLocations: isAllLocations || undefined,
    }),
    [range.from, range.to, isAllLocations],
  );

  const scopedLocationId = isAllLocations ? locationId : effectiveLocationId;

  const kpisQuery = useSalesKPIsQuery(token, scopedLocationId, filters);
  const dailyQuery = useDailySalesSummaryQuery(token, scopedLocationId, filters);
  const priorDailyQuery = useDailySalesSummaryQuery(token, scopedLocationId, priorFilters);
  const locationsQuery = useLocationsQuery(token);
  const employeesQuery = useEmployeesQuery(token, effectiveLocationId);
  const itemsQuery = useSalesByItemQuery(token, scopedLocationId, reportFilters);
  const employeesReportQuery = useSalesByEmployeeQuery(token, scopedLocationId, reportFilters);

  const days: DailySalesRow[] = dailyQuery.data?.data ?? [];
  const priorDays: DailySalesRow[] = priorDailyQuery.data?.data ?? [];

  const topItems = useMemo(
    () =>
      [...(itemsQuery.data?.data ?? [])]
        .sort((a, b) =>
          topItemsSort === "units"
            ? b.unitsSold - a.unitsSold
            : parseFloat(b.totalRevenue) - parseFloat(a.totalRevenue),
        )
        .slice(0, 5),
    [itemsQuery.data?.data, topItemsSort],
  );

  const topEmployees = useMemo(
    () =>
      [...(employeesReportQuery.data?.data ?? [])]
        .sort((a, b) => b.totalSales - a.totalSales)
        .slice(0, 5),
    [employeesReportQuery.data?.data],
  );

  const chartData = useMemo(
    () =>
      days.map((day, index) => ({
        date: new Date(day.date).toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
        grossSales: parseFloat(day.grossSales),
        priorGrossSales: priorDays[index] ? parseFloat(priorDays[index].grossSales) : undefined,
      })),
    [days, priorDays],
  );

  const totals: DailyTotals = useMemo(
    () =>
      days.reduce(
        (acc, day) => ({
          salesCount: acc.salesCount + day.salesCount,
          grossSales: acc.grossSales + parseFloat(day.grossSales),
          refunds: acc.refunds + parseFloat(day.refunds),
          discounts: acc.discounts + parseFloat(day.discounts),
          netSales: acc.netSales + parseFloat(day.netSales),
          costOfGoods: acc.costOfGoods + parseFloat(day.costOfGoods),
          grossProfit: acc.grossProfit + parseFloat(day.grossProfit),
        }),
        {
          salesCount: 0,
          grossSales: 0,
          refunds: 0,
          discounts: 0,
          netSales: 0,
          costOfGoods: 0,
          grossProfit: 0,
        },
      ),
    [days],
  );

  const totalMargin =
    totals.netSales > 0 ? ((totals.grossProfit / totals.netSales) * 100).toFixed(1) : "0.0";

  function applyPreset(nextPreset: ReportsPreset) {
    setPreset(nextPreset);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (nextPreset) {
      case "today":
        setRange({ from: today, to: today });
        break;
      case "7d":
        setRange({ from: addDays(today, -6), to: today });
        break;
      case "30d":
        setRange({ from: addDays(today, -29), to: today });
        break;
      case "month":
        setRange({ from: startOfMonth(today), to: today });
        break;
      case "custom":
        setCustomFrom(toISO(range.from));
        setCustomTo(toISO(range.to));
        break;
    }
  }

  function navigateRange(direction: "prev" | "next") {
    const duration = daysBetween(range.from, range.to) + 1;
    const shift = direction === "prev" ? -duration : duration;
    setRange({ from: addDays(range.from, shift), to: addDays(range.to, shift) });
    setPreset("");
  }

  function setCustomRange(start: string, end: string) {
    setCustomFrom(start);
    setCustomTo(end);
    if (start && end) {
      setRange({ from: new Date(start), to: new Date(end) });
    }
  }

  return {
    authLoading: loading,
    range,
    preset,
    customFrom,
    customTo,
    selectedLocation,
    selectedEmployee,
    topItemsSort,
    currentLocationId: locationId,
    isDataLoading: kpisQuery.isLoading || dailyQuery.isLoading || priorDailyQuery.isLoading,
    itemsLoading: itemsQuery.isLoading,
    employeesReportLoading: employeesReportQuery.isLoading,
    kpis: kpisQuery.data,
    days,
    locations: locationsQuery.data?.data ?? [],
    employees: employeesQuery.data?.data ?? [],
    topItems,
    topEmployees,
    chartData,
    totals,
    totalMargin,
    applyPreset,
    navigateRange,
    setCustomRange,
    setSelectedLocation,
    setSelectedEmployee,
    setTopItemsSort,
    tryAllLocations: () => setSelectedLocation("__all__"),
  };
}
