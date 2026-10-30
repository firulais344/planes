import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { PlanSchema } from "./lib/schema";

const planes = defineCollection({
  loader: glob({ pattern: "*.json", base: "./src/content/planes" }),
  schema: PlanSchema,
});

export const collections = { planes };
