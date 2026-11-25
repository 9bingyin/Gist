import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCheckboxClassName, getSortIcon } from "@/lib/table-utils";

export type SortDirection = "asc" | "desc";

export interface SortableColumn<T extends string> {
  field?: T;
  label: string;
  className?: string;
}

interface TableCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
  ariaLabel: string;
}

export function TableCheckbox({
  checked,
  indeterminate = false,
  onToggle,
  ariaLabel,
}: TableCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={cn(
        "flex size-4 items-center justify-center rounded border transition-colors",
        getCheckboxClassName(checked, indeterminate),
      )}
    >
      {indeterminate ? (
        <Minus className="size-3" strokeWidth={3} />
      ) : checked ? (
        <Check className="size-3" strokeWidth={3} />
      ) : null}
    </button>
  );
}

interface SortableTableHeaderProps<T extends string> {
  columns: SortableColumn<T>[];
  sortField: T;
  sortDirection: SortDirection;
  onSort: (field: T) => void;
  isAllSelected: boolean;
  isPartialSelected: boolean;
  onSelectAll: () => void;
  selectAllLabel: string;
}

export function SortableTableHeader<T extends string>({
  columns,
  sortField,
  sortDirection,
  onSort,
  isAllSelected,
  isPartialSelected,
  onSelectAll,
  selectAllLabel,
}: SortableTableHeaderProps<T>) {
  return (
    <thead className="bg-muted/50">
      <tr>
        <th className="w-10 px-3 py-2 text-left">
          <TableCheckbox
            checked={isAllSelected}
            indeterminate={isPartialSelected}
            onToggle={onSelectAll}
            ariaLabel={selectAllLabel}
          />
        </th>
        {columns.map((col) => (
          <th
            key={col.label}
            className={cn(
              "px-3 py-2 text-left font-medium text-muted-foreground",
              col.className,
            )}
          >
            {col.field ? (
              <button
                type="button"
                onClick={() => onSort(col.field!)}
                className="flex items-center hover:text-foreground transition-colors"
              >
                {col.label}
                <span
                  className={
                    sortField === col.field
                      ? "ml-1"
                      : "ml-1 text-muted-foreground/50"
                  }
                >
                  {getSortIcon(sortField, col.field, sortDirection)}
                </span>
              </button>
            ) : (
              col.label
            )}
          </th>
        ))}
      </tr>
    </thead>
  );
}
