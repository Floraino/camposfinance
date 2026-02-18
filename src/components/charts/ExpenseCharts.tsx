import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { getCategoryDisplay, getCategoryChartColor } from "@/lib/categoryResolvers";
import type { HouseholdCategory } from "@/services/householdCategoriesService";

interface ExpenseData {
  category: string;
  amount: number;
}

interface ExpensePieChartProps {
  data: ExpenseData[];
  customCategories?: HouseholdCategory[];
  className?: string;
}

export function ExpensePieChart({ data, customCategories, className }: ExpensePieChartProps) {
  const total = useMemo(() => data.reduce((acc, item) => acc + item.amount, 0), [data]);

  const chartData = useMemo(() => 
    data.map((item) => {
      const display = getCategoryDisplay(item.category, customCategories);
      return {
        name: display.label,
        value: item.amount,
        color: getCategoryChartColor(item.category, customCategories),
        percentage: total > 0 ? ((item.amount / total) * 100).toFixed(1) : "0",
      };
    }),
    [data, total, customCategories]
  );

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2 mt-4">
        {chartData.slice(0, 4).map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-muted-foreground truncate">
              {item.name}
            </span>
            <span className="text-xs font-medium text-foreground ml-auto">
              {item.percentage}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface MonthlyData {
  month: string;
  expenses: number;
}

interface MonthlyBarChartProps {
  data: MonthlyData[];
  className?: string;
}

export function MonthlyBarChart({ data, className }: MonthlyBarChartProps) {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 10%, 20%)" vertical={false} />
          <XAxis 
            dataKey="month" 
            axisLine={false} 
            tickLine={false}
            tick={{ fill: "hsl(220, 10%, 55%)", fontSize: 12 }}
          />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(220, 12%, 14%)",
              border: "1px solid hsl(220, 10%, 20%)",
              borderRadius: "12px",
              padding: "8px 12px",
            }}
            labelStyle={{ color: "hsl(40, 20%, 95%)", fontWeight: 600 }}
            itemStyle={{ color: "hsl(40, 20%, 95%)" }}
            formatter={(value: number) => 
              new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
            }
          />
          <Bar 
            dataKey="expenses" 
            fill="hsl(0, 60%, 50%)" 
            radius={[4, 4, 0, 0]}
            name="Gastos"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
