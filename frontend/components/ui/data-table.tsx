/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Adapted from Plane packages/ui/src/tables/table.tsx at
 * 7cef741c29cf61d3bca18dc892e6af11a1e7becc.
 */

import type { ReactNode } from "react";
import styles from "./data-table.module.css";

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T) => ReactNode;
};

export type DataTableProps<T> = {
  data: T[];
  columns: DataTableColumn<T>[];
  keyExtractor: (row: T) => string;
  caption: string;
  emptyState?: ReactNode;
};

export function DataTable<T>({ data, columns, keyExtractor, caption, emptyState = "暂无数据" }: DataTableProps<T>) {
  return (
    <div className={styles.viewport}>
      <table className={styles.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className={styles.headerRow}>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={`${styles.headerCell} ${column.headerClassName ?? ""}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length > 0 ? data.map((row) => (
            <tr key={keyExtractor(row)} className={styles.bodyRow}>
              {columns.map((column) => (
                <td key={`${column.key}-${keyExtractor(row)}`} className={`${styles.bodyCell} ${column.cellClassName ?? ""}`}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td className={`${styles.bodyCell} ${styles.emptyCell}`} colSpan={columns.length}>{emptyState}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
