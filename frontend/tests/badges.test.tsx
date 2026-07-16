import { render, screen } from "@testing-library/react";
import { ConfidenceIndicator, RiskBadge, StatusBadge } from "@/components/ui/badges";

describe("compliance badges", () => {
  it("renders text in addition to risk color", () => {
    render(<><RiskBadge level="fatal" /><StatusBadge status="review" /></>);
    expect(screen.getByText("致命")).toBeInTheDocument();
    expect(screen.getByText("人工复核")).toBeInTheDocument();
  });

  it("routes low confidence to visible review state", () => {
    render(<ConfidenceIndicator value={0.68} />);
    expect(screen.getByText("68% · 需复核")).toBeInTheDocument();
    expect(screen.getByLabelText("置信度 68%")).toBeInTheDocument();
  });
});
