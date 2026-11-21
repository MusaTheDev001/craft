import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MobileDrawer from "./MobileDrawer";

describe("MobileDrawer", () => {
  it("hides the closed drawer from assistive tech and the tab order", () => {
    render(<MobileDrawer open={false} onClose={vi.fn()} />);

    const drawer = screen.getByTestId("mobile-drawer");

    expect(drawer).toHaveAttribute("aria-hidden", "true");
    expect(drawer).toHaveAttribute("inert");
  });

  it("exposes the drawer when open", () => {
    render(<MobileDrawer open onClose={vi.fn()} />);

    const drawer = screen.getByTestId("mobile-drawer");

    expect(drawer).toHaveAttribute("aria-hidden", "false");
    expect(drawer).not.toHaveAttribute("inert");
  });
});
