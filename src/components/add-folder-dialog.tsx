"use client";

import { useState, useEffect } from "react";
import { FolderPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { ContentType } from "@/lib/types";

interface AddFolderDialogProps {
  onAdd: (name: string, type: ContentType) => Promise<void>;
  defaultType?: ContentType;
  children?: React.ReactNode;
}

export function AddFolderDialog({
  onAdd,
  defaultType = "article",
  children,
}: AddFolderDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<ContentType>(defaultType);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { t } = useTranslation();

  // Update type when defaultType changes
  useEffect(() => {
    setType(defaultType);
  }, [defaultType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError("");

    try {
      await onAdd(name.trim(), type);
      setName("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("addfolder.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <FolderPlusIcon className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addfolder.title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("addfolder.name_label")}</Label>
            <Input
              placeholder={t("addfolder.placeholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>{t("content_type.select_type")}</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as ContentType)}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="article">
                  {t("content_type.article")}
                </SelectItem>
                <SelectItem value="picture">
                  {t("content_type.picture")}
                </SelectItem>
                <SelectItem value="notification">
                  {t("content_type.notification")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full"
          >
            {loading ? t("addfolder.creating") : t("addfolder.create")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
