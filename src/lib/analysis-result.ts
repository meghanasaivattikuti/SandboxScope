import { z } from "zod";

export const analysisResultSchema = z.object({
  summary: z.string().min(1).max(2_000),
  metrics: z.array(z.object({
    label: z.string().min(1).max(100),
    value: z.union([z.string().max(200), z.number().finite(), z.boolean()])
      .transform((value) => typeof value === "boolean" ? String(value) : value),
  })).max(20),
  chart: z.object({
    type: z.string().min(1).max(30).transform(() => "bar" as const),
    title: z.string().min(1).max(200),
    labels: z.array(z.string().max(100)).min(1).max(30),
    series: z.array(z.object({
      name: z.string().min(1).max(100),
      data: z.array(z.preprocess(
        (value) => typeof value === "string" && value.trim() !== "" ? Number(value) : value,
        z.number().finite(),
      )).min(1).max(30),
    })).min(1).max(6),
  }).superRefine((chart, context) => {
    chart.series.forEach((series, index) => {
      if (series.data.length !== chart.labels.length) {
        context.addIssue({
          code: "custom",
          path: ["series", index, "data"],
          message: "Chart series must match the number of labels.",
        });
      }
    });
  }),
  notes: z.array(z.string().min(1).max(500)).max(12).default([]),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;
