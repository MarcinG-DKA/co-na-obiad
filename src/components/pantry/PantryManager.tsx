import React, { useState, useRef } from "react";
import { Plus, Pencil, Trash2, Check, X, Package } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PantryItem } from "@/lib/services/pantry";

interface Props {
  initialItems: PantryItem[];
}

export default function PantryManager({ initialItems }: Props) {
  const [items, setItems] = useState<PantryItem[]>(initialItems);
  const [newName, setNewName] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  async function handleAdd(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;

    const tempId = `temp-${Date.now()}`;
    const quantity = newQuantity ? Number(newQuantity) : null;
    const unit = newUnit.trim() || null;

    const optimistic: PantryItem = {
      id: tempId,
      household_id: "",
      name,
      quantity,
      unit,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setItems((prev) => [...prev, optimistic]);
    setNewName("");
    setNewQuantity("");
    setNewUnit("");
    setIsAdding(true);

    try {
      const res = await fetch("/api/pantry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, quantity, unit }),
      });
      const json = (await res.json()) as { data?: PantryItem; error?: string };
      if (!res.ok || !json.data) {
        throw new Error(json.error ?? "Could not add item");
      }
      const created = json.data;
      setItems((prev) => prev.map((item) => (item.id === tempId ? created : item)));
    } catch (err) {
      setItems((prev) => prev.filter((item) => item.id !== tempId));
      toast.error(err instanceof Error ? err.message : "Could not add item");
    } finally {
      setIsAdding(false);
      nameInputRef.current?.focus();
    }
  }

  function startEdit(item: PantryItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditQuantity(item.quantity != null ? String(item.quantity) : "");
    setEditUnit(item.unit ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleUpdate(itemId: string) {
    const name = editName.trim();
    if (!name) return;

    const quantity = editQuantity ? Number(editQuantity) : null;
    const unit = editUnit.trim() || null;

    const prev = items.find((i) => i.id === itemId);
    if (!prev) return;

    const updated = { ...prev, name, quantity, unit, updated_at: new Date().toISOString() };
    setItems((current) => current.map((i) => (i.id === itemId ? updated : i)));
    setEditingId(null);

    try {
      const res = await fetch(`/api/pantry/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, quantity, unit }),
      });
      const json = (await res.json()) as { data?: PantryItem; error?: string };
      if (!res.ok || !json.data) {
        throw new Error(json.error ?? "Could not update item");
      }
      const saved = json.data;
      setItems((current) => current.map((i) => (i.id === itemId ? saved : i)));
    } catch (err) {
      setItems((current) => current.map((i) => (i.id === itemId ? prev : i)));
      toast.error(err instanceof Error ? err.message : "Could not update item");
    }
  }

  async function handleRemove(itemId: string) {
    const removed = items.find((i) => i.id === itemId);
    if (!removed) return;

    setItems((current) => current.filter((i) => i.id !== itemId));

    try {
      const res = await fetch(`/api/pantry/${itemId}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Could not remove item");
      }
    } catch (err) {
      setItems((current) => (current.some((i) => i.id === itemId) ? current : [...current, removed]));
      toast.error(err instanceof Error ? err.message : "Could not remove item");
    }
  }

  return (
    <div className="w-full max-w-lg space-y-6">
      <form onSubmit={handleAdd} className="space-y-3">
        <div className="flex gap-2">
          <Input
            ref={nameInputRef}
            type="text"
            placeholder="Item name..."
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
            }}
            className="flex-1 border-white/20 bg-white/10 text-white placeholder-white/40 focus-visible:border-purple-400 focus-visible:ring-purple-400/50"
            disabled={isAdding}
          />
          <Button
            type="submit"
            disabled={isAdding || !newName.trim()}
            className="bg-purple-600 text-white hover:bg-purple-500"
          >
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Qty"
            value={newQuantity}
            onChange={(e) => {
              setNewQuantity(e.target.value);
            }}
            min="1"
            step="any"
            className="w-24 border-white/20 bg-white/10 text-white placeholder-white/40 focus-visible:border-purple-400 focus-visible:ring-purple-400/50"
            disabled={isAdding}
          />
          <Input
            type="text"
            placeholder="Unit (g, ml, pcs...)"
            value={newUnit}
            onChange={(e) => {
              setNewUnit(e.target.value);
            }}
            className="w-40 border-white/20 bg-white/10 text-white placeholder-white/40 focus-visible:border-purple-400 focus-visible:ring-purple-400/50"
            disabled={isAdding}
          />
        </div>
      </form>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-blue-100/50">
          <Package className="size-8" />
          <p className="text-sm">Your pantry is empty. Add some items above.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3",
                item.id.startsWith("temp-") && "animate-pulse opacity-70",
              )}
            >
              {editingId === item.id ? (
                <div className="flex flex-1 flex-col gap-2">
                  <Input
                    type="text"
                    value={editName}
                    onChange={(e) => {
                      setEditName(e.target.value);
                    }}
                    className="border-white/20 bg-white/10 text-white focus-visible:border-purple-400 focus-visible:ring-purple-400/50"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleUpdate(item.id);
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={editQuantity}
                      onChange={(e) => {
                        setEditQuantity(e.target.value);
                      }}
                      min="1"
                      step="any"
                      className="w-24 border-white/20 bg-white/10 text-white placeholder-white/40 focus-visible:border-purple-400 focus-visible:ring-purple-400/50"
                    />
                    <Input
                      type="text"
                      placeholder="Unit"
                      value={editUnit}
                      onChange={(e) => {
                        setEditUnit(e.target.value);
                      }}
                      className="w-32 border-white/20 bg-white/10 text-white placeholder-white/40 focus-visible:border-purple-400 focus-visible:ring-purple-400/50"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        void handleUpdate(item.id);
                      }}
                      className="bg-green-600 text-white hover:bg-green-500"
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={cancelEdit}
                      className="text-white/60 hover:text-white"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-white">{item.name}</span>
                    {(item.quantity != null || item.unit) && (
                      <span className="ml-2 text-sm text-blue-100/60">
                        {item.quantity != null && item.quantity}
                        {item.quantity != null && item.unit && " "}
                        {item.unit}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      startEdit(item);
                    }}
                    className="text-white/40 transition-colors hover:text-purple-300"
                    aria-label={`Edit ${item.name}`}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Remove ${item.name}?`)) {
                        void handleRemove(item.id);
                      }
                    }}
                    className="text-white/40 transition-colors hover:text-red-400"
                    aria-label={`Remove ${item.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
