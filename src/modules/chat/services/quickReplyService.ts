import { supabase } from "@/lib/supabase";

export interface ChatQuickReply {
  id: string;
  company_id: string;
  department_id: string | null;
  shortcut: string;
  content: string;
  sort_order: number;
  category: string | null;
  visibility: "company" | "private";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const TBL = "chat_quick_replies" as never;

export const quickReplyService = {
  async list(companyId: string): Promise<ChatQuickReply[]> {
    const { data, error } = await supabase
      .from(TBL)
      .select("*")
      .eq("company_id" as never, companyId as never)
      .order("sort_order" as never, { ascending: true })
      .order("shortcut" as never, { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as ChatQuickReply[];
  },

  async create(input: {
    companyId: string;
    shortcut: string;
    content: string;
    departmentId?: string | null;
    sortOrder?: number;
    category?: string | null;
    visibility?: "company" | "private";
  }) {
    // created_by é o que a regra de frase privada confere (RLS): sem ele a privada seria recusada.
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from(TBL).insert({
      company_id: input.companyId,
      shortcut: input.shortcut,
      content: input.content,
      department_id: input.departmentId ?? null,
      sort_order: input.sortOrder ?? 0,
      category: input.category?.trim() || null,
      visibility: input.visibility ?? "company",
      created_by: auth.user?.id ?? null,
    } as never);
    if (error) throw error;
  },

  async update(
    id: string,
    patch: Partial<
      Pick<
        ChatQuickReply,
        "shortcut" | "content" | "department_id" | "sort_order" | "category" | "visibility"
      >
    >,
  ) {
    const { error } = await supabase
      .from(TBL)
      .update(patch as never)
      .eq("id" as never, id as never);
    if (error) throw error;
  },

  async remove(id: string) {
    const { error } = await supabase
      .from(TBL)
      .delete()
      .eq("id" as never, id as never);
    if (error) throw error;
  },
};
