import { z } from "zod";

// ============================= Dashboards =============================

export const createDashboardSchema = z.object({
  name: z.string().trim().min(1, "Give the dashboard a name.").max(80, "Keep the name under 80 characters."),
});

export type CreateDashboardInput = z.infer<typeof createDashboardSchema>;

export const saveDashboardTemplateSchema = z.object({
  name: z.string().trim().min(1, "Give the template a name.").max(80, "Keep the name under 80 characters."),
});

export type SaveDashboardTemplateInput = z.infer<typeof saveDashboardTemplateSchema>;

// ============================= Widgets =============================

export const widgetTypeSchema = z.enum([
  "REVENUE",
  "PIPELINE",
  "TASKS",
  "CALENDAR",
  "NOTES",
  "AI_ACTIVITY",
  "REPORTS",
  "WEATHER",
  "CLOCK",
  "UPCOMING_MEETINGS",
]);

export const widgetPositionSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
});

export const addWidgetSchema = z.object({
  type: widgetTypeSchema,
  position: widgetPositionSchema,
});

export type AddWidgetInput = z.infer<typeof addWidgetSchema>;

export const widgetWeatherConfigSchema = z.object({
  city: z.string().trim().min(1, "Enter a city.").max(100, "Keep the city name under 100 characters."),
});

export type WidgetWeatherConfigInput = z.infer<typeof widgetWeatherConfigSchema>;

export const widgetNotesSchema = z.object({
  text: z.string().max(20000, "Note is too long."),
});

export type WidgetNotesInput = z.infer<typeof widgetNotesSchema>;

// ============================= Search / command bar =============================

export const searchQuerySchema = z.object({
  query: z.string().trim().min(2, "Type at least 2 characters."),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
