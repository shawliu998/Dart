import { render, screen, within } from "@testing-library/react";
import { DataTable } from "@/components/ui/data-table";

describe("DataTable", () => {
  const columns = [
    { key: "name", header: "项目", render: (row: { id: string; name: string }) => row.name },
    { key: "status", header: "状态", render: () => "进行中" },
  ];

  it("renders an accessible caption, headers and rows", () => {
    render(<DataTable caption="项目组合" data={[{ id: "p-1", name: "城市数据中台" }]} columns={columns} keyExtractor={(row) => row.id} />);

    const table = screen.getByRole("table", { name: "项目组合" });
    expect(within(table).getByRole("columnheader", { name: "项目" })).toBeInTheDocument();
    expect(within(table).getByText("城市数据中台")).toBeInTheDocument();
  });

  it("renders the supplied empty state", () => {
    render(<DataTable caption="空项目组合" data={[]} columns={columns} keyExtractor={(row) => row.id} emptyState="当前没有项目" />);
    expect(screen.getByText("当前没有项目")).toBeInTheDocument();
  });
});
