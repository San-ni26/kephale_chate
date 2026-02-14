"use client";

import { useEditor, EditorContent, type Content } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import {
    type LucideIcon,
    Bold,
    Italic,
    Underline as UnderlineIcon,
    List,
    ListOrdered,
    Quote,
    Code,
    Minus,
    Heading1,
    Heading2,
    Heading3,
    CheckSquare,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

const MenuButton = ({
    onClick,
    active,
    disabled,
    icon: Icon,
    title,
}: {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    icon: LucideIcon;
    title: string;
}) => (
    <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8 text-muted-foreground hover:text-foreground", active && "bg-muted text-foreground")}
        onClick={onClick}
        disabled={disabled}
        title={title}
    >
        <Icon className="h-4 w-4" />
    </Button>
);

interface NoteEditorProps {
    content: Content;
    onChange: (html: string) => void;
    placeholder?: string;
    editable?: boolean;
    className?: string;
}

export function NoteEditor({ content, onChange, placeholder = "Écrire une note…", editable = true, className }: NoteEditorProps) {
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
            }),
            Underline,
            TaskList,
            TaskItem.configure({
                nested: true,
                HTMLAttributes: { class: "flex items-start gap-2" },
            }),
            HorizontalRule,
        ],
        content: content || "",
        editable,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: "note-editor-content min-h-[120px] px-3 py-2 focus:outline-none text-foreground",
            },
        },
    });

    if (!editor) return null;

    return (
        <div className={cn("rounded-lg border border-border bg-card overflow-hidden min-w-0", className)}>
            {editable && (
                <div className="flex flex-wrap items-center gap-0.5 border-b border-border p-1 bg-muted/40 overflow-x-auto">
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        active={editor.isActive("heading", { level: 1 })}
                        icon={Heading1}
                        title="Titre 1"
                    />
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        active={editor.isActive("heading", { level: 2 })}
                        icon={Heading2}
                        title="Titre 2"
                    />
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                        active={editor.isActive("heading", { level: 3 })}
                        icon={Heading3}
                        title="Titre 3"
                    />
                    <div className="w-px h-6 bg-border mx-0.5" />
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        active={editor.isActive("bold")}
                        icon={Bold}
                        title="Gras"
                    />
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        active={editor.isActive("italic")}
                        icon={Italic}
                        title="Italique"
                    />
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        active={editor.isActive("underline")}
                        icon={UnderlineIcon}
                        title="Souligné"
                    />
                    <div className="w-px h-6 bg-border mx-0.5" />
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        active={editor.isActive("bulletList")}
                        icon={List}
                        title="Liste à puces"
                    />
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        active={editor.isActive("orderedList")}
                        icon={ListOrdered}
                        title="Liste numérotée"
                    />
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleTaskList().run()}
                        active={editor.isActive("taskList")}
                        icon={CheckSquare}
                        title="Checklist"
                    />
                    <div className="w-px h-6 bg-border mx-0.5" />
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                        active={editor.isActive("blockquote")}
                        icon={Quote}
                        title="Citation"
                    />
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                        active={editor.isActive("codeBlock")}
                        icon={Code}
                        title="Bloc de code"
                    />
                    <MenuButton
                        onClick={() => editor.chain().focus().setHorizontalRule().run()}
                        icon={Minus}
                        title="Séparateur (ligne horizontale)"
                    />
                </div>
            )}
            <EditorContent editor={editor} />
            <style jsx global>{`
                .note-editor-content.ProseMirror,
                .ProseMirror.note-editor-content {
                    min-height: 120px;
                }
                .note-editor-content.ProseMirror h1,
                .ProseMirror.note-editor-content h1 {
                    font-size: 1.5rem;
                    font-weight: 700;
                    margin: 0.75em 0 0.25em;
                }
                .note-editor-content.ProseMirror h2,
                .ProseMirror.note-editor-content h2 {
                    font-size: 1.25rem;
                    font-weight: 600;
                    margin: 0.75em 0 0.25em;
                }
                .note-editor-content.ProseMirror h3,
                .ProseMirror.note-editor-content h3 {
                    font-size: 1.125rem;
                    font-weight: 600;
                    margin: 0.5em 0 0.25em;
                }
                .note-editor-content.ProseMirror ul:not([data-type="taskList"]) {
                    list-style-type: disc;
                    padding-left: 1.5rem;
                    margin: 0.5em 0;
                }
                .note-editor-content.ProseMirror ol {
                    list-style-type: decimal;
                    padding-left: 1.5rem;
                    margin: 0.5em 0;
                }
                .note-editor-content.ProseMirror blockquote {
                    border-left: 4px solid var(--border);
                    padding-left: 1rem;
                    margin: 0.5em 0;
                    color: var(--muted-foreground);
                }
                .note-editor-content.ProseMirror pre {
                    background: var(--muted);
                    padding: 0.75rem 1rem;
                    border-radius: 0.375rem;
                    overflow-x: auto;
                    margin: 0.5em 0;
                    font-size: 0.875rem;
                }
                .note-editor-content.ProseMirror hr {
                    border: none;
                    border-top: 1px solid var(--border);
                    margin: 1em 0;
                }
                .ProseMirror ul[data-type="taskList"] {
                    list-style: none;
                    padding-left: 0;
                }
                .ProseMirror ul[data-type="taskList"] li {
                    display: flex;
                    align-items: flex-start;
                    gap: 0.5rem;
                }
                .ProseMirror ul[data-type="taskList"] li > label {
                    flex-shrink: 0;
                    cursor: pointer;
                }
                .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div {
                    text-decoration: line-through;
                    opacity: 0.7;
                }
            `}</style>
        </div>
    );
}
