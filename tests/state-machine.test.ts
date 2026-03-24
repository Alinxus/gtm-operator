import { describe, expect, it } from "vitest";
import { approvalRequiresOverrideReason, approvalStageForAsset, assetStatusFromApproval, defaultChannelsForCampaignType, runStatusAfterApproval } from "../src/state-machine.js";
import type { Asset, Critique } from "../src/domain.js";

describe("state machine", () => {
  it("maps channels to approval stages", () => {
    expect(approvalStageForAsset("reply")).toBe("WAITING_FOR_SEND_APPROVAL");
    expect(approvalStageForAsset("seo")).toBe("WAITING_FOR_PUBLISH_APPROVAL");
  });

  it("requires override reasons for overrides", () => {
    expect(approvalRequiresOverrideReason("override")).toBe(true);
    expect(approvalRequiresOverrideReason("approve")).toBe(false);
  });

  it("turns critique outcomes into asset statuses", () => {
    const blockingCritique = { blockingIssues: ["bad claim"] } as Critique;
    expect(assetStatusFromApproval("override", blockingCritique)).toBe("approved_with_exceptions");
    expect(assetStatusFromApproval("revise", blockingCritique)).toBe("needs_revision");
  });

  it("completes a run when all assets are approved", () => {
    const assets = [{ status: "approved" }, { status: "approved_with_exceptions" }] as Asset[];
    expect(runStatusAfterApproval(assets)).toBe("completed");
  });

  it("provides sensible default channel bundles", () => {
    expect(defaultChannelsForCampaignType("launch")).toContain("social");
    expect(defaultChannelsForCampaignType("founder_social")).toContain("reply");
  });
});
