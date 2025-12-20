"use client";

import { useState, useEffect } from "react";
import { PlusIcon } from "lucide-react";
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

interface AddFeedDialogProps {
  onAdd: (url: string, type: ContentType) => Promise<void>;
  defaultType?: ContentType;
  children?: React.ReactNode;
}

export function AddFeedDialog({
  onAdd,
  defaultType = "article",
  children,
}: AddFeedDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [type, setType] = useState<ContentType>(defaultType);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Update type when defaultType changes
  useEffect(() => {
    setType(defaultType);
  }, [defaultType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError("");

    try {
      await onAdd(url.trim(), type);
      setUrl("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("addfeed.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ? (
          children
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <PlusIcon className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addfeed.title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("addfeed.url_label")}</Label>
            <Input
              placeholder={t("addfeed.placeholder")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
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
            disabled={loading || !url.trim()}
            className="w-full"
          >
            {loading ? t("addfeed.adding") : t("addfeed.add")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
