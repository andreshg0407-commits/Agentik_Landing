/**
 * business-structure/index.ts
 *
 * Public API for the Castillitos Business Structure Engine.
 *
 * Usage:
 *   import {
 *     inferBusinessDimensions,
 *     BUSINESS_LINE_REGISTRY,
 *     SALES_CHANNEL_REGISTRY,
 *     OPERATING_UNIT_REGISTRY,
 *   } from "@/lib/business-structure";
 */

// Types
export type {
  BusinessLine,
  SalesChannelKey,
  OperatingUnitKey,
  BusinessDimensions,
} from "./types";

// Dimension registries + metadata types
export type {
  BusinessLineMeta,
  SalesChannelMeta,
  OperatingUnitMeta,
} from "./dimensions";

export {
  BUSINESS_LINE_REGISTRY,
  SALES_CHANNEL_REGISTRY,
  OPERATING_UNIT_REGISTRY,
  getBusinessLineMeta,
  getSalesChannelMeta,
  getOperatingUnitMeta,
  activeBusinessLines,
  activeSalesChannels,
  activeOperatingUnits,
} from "./dimensions";

// Inference functions
export {
  inferBusinessLine,
  inferSalesChannel,
  inferOperatingUnit,
  inferBusinessDimensions,
} from "./inference";
