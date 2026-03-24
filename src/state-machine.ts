import type { ApprovalDecision, Asset, AssetStatus, CampaignType, ChannelType, Critique, Run, RunStatus } from "./domain.js";

export function approvalStageForAsset(channel: Asset["channel"]) {
  if (channel === "landing" || channel === "seo") return "WAITING_FOR_PUBLISH_APPROVAL";
  if (channel === "outbound" || channel === "reply" || channel === "partnership") return "WAITING_FOR_SEND_APPROVAL";
  return "WAITING_FOR_MESSAGE_APPROVAL";
}

export function assetStatusFromCritique(critique: Critique): AssetStatus {
  return critique.blockingIssues.length > 0 ? "needs_revision" : "review_required";
}

export function assetStatusFromApproval(decision: ApprovalDecision, critique: Critique | undefined): AssetStatus {
  if (decision === "reject" || decision === "revise") return "needs_revision";
  if (decision === "override") return "approved_with_exceptions";
  if ((critique?.blockingIssues.length ?? 0) > 0) return "approved_with_exceptions";
  return "approved";
}

export function approvalRequiresReason(decision: ApprovalDecision) {
  return decision === "reject" || decision === "override" || decision === "revise";
}

export function approvalRequiresOverrideReason(decision: ApprovalDecision) {
  return decision === "override";
}

export function isAssetReadyForHumanApproval(asset: Asset) {
  return asset.status === "review_required" || asset.status === "needs_revision";
}

export function runStatusAfterExecution(run: Run): RunStatus {
  if (run.status === "failed") return "failed";
  return "awaiting_human_review";
}

export function runStatusAfterApproval(assets: Asset[]): RunStatus {
  if (assets.length === 0) return "blocked";
  if (assets.some((asset) => asset.status === "needs_revision")) return "revision_required";
  if (assets.every((asset) => asset.status === "approved" || asset.status === "approved_with_exceptions")) {
    return "completed";
  }
  return "awaiting_human_review";
}

export function humanReadableApprovalDecision(decision: ApprovalDecision) {
  switch (decision) {
    case "approve":
      return "approved";
    case "override":
      return "approved_with_exceptions";
    case "reject":
      return "rejected";
    case "revise":
      return "needs_revision";
  }
}

export function canHumanOverrideCritique(critique: Critique) {
  return critique.blockingIssues.length > 0;
}

export function defaultChannelsForCampaignType(campaignType: CampaignType): ChannelType[] {
  switch (campaignType) {
    case "launch":
      return ["social", "community", "outbound", "seo"];
    case "content_engine":
      return ["seo", "social", "community"];
    case "founder_social":
      return ["social", "reply", "community"];
    case "partnership_outbound":
      return ["outbound", "partnership", "social"];
    case "competitive_response":
      return ["social", "seo", "reply"];
    case "other":
    default:
      return ["social", "community", "outbound", "seo"];
  }
}
