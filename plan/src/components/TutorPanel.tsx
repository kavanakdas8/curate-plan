"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    Bot,
    X,
    Send,
    Sparkles,
    Loader2,
    BookOpen,
    MessageCircle,
    RotateCcw,
} from "lucide-react";

type ChatMessage = {
    role: "user" | "assistant";
    content: string;
};

type TutorPanelProps = {
    currentPlan: Record<string, unknown> | null;
    isOpen?: boolean;
    onClose?: () => void;
};

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

const STARTER_QUESTIONS = [
    "Explain a difficult concept simply",
    "Give me a practical example",
    "Quiz me on what I'm learning",
];

export function TutorPanel({ currentPlan, isOpen: controlledIsOpen, onClose }: TutorPanelProps) {
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

    const handleClose = () => {
        if (onClose) {
            onClose();
        } else {
            setInternalIsOpen(false);
        }
    };
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            role: "assistant",
            content:
                "Hey! I'm your CuratePlan AI Tutor. 👋\n\nAsk me anything — I can explain concepts, help with coding problems, give examples, or quiz you on what you're learning.\n\nWhat are we working on today?",
        },
    ]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
        });
    }, [messages, isLoading]);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 150);
        }
    }, [isOpen]);

    const sendMessage = async (text: string) => {
        const message = text.trim();

        if (!message || isLoading) return;

        const previousMessages = messages;
        const updatedMessages: ChatMessage[] = [
            ...previousMessages,
            { role: "user", content: message },
        ];

        setMessages(updatedMessages);
        setInput("");
        setError(null);
        setIsLoading(true);

        try {
            const response = await fetch(
                `${API_BASE_URL}/api/assistant/chat`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        message,
                        history: previousMessages,
                        current_plan: currentPlan,
                    }),
                }
            );

            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(
                    data?.detail || `Assistant request failed (${response.status}).`
                );
            }

            if (!data?.reply) {
                throw new Error("The assistant returned an empty response.");
            }

            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: data.reply },
            ]);
        } catch (err) {
            const errorMessage =
                err instanceof Error
                    ? err.message
                    : "Something went wrong. Please try again.";

            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void sendMessage(input);
    };

    const resetConversation = () => {
        setMessages([
            {
                role: "assistant",
                content:
                    "Fresh start! What would you like to learn or discuss?",
            },
        ]);
        setError(null);
    };

    return (
        <>
            {/* Tutor Slide-out Panel */}
            <div
                className={`fixed right-4 top-4 bottom-4 z-50 flex w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 ${isOpen
                    ? "translate-x-0 opacity-100"
                    : "pointer-events-none translate-x-[110%] opacity-0"
                    }`}
                aria-hidden={!isOpen}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                            <Bot className="h-5 w-5" />
                        </div>

                        <div>
                            <h2 className="text-sm font-bold text-slate-900">
                                AI Study Tutor
                            </h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={resetConversation}
                            title="New conversation"
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        >
                            <RotateCcw className="h-4 w-4" />
                        </button>

                        <button
                            type="button"
                            onClick={handleClose}
                            title="Close tutor"
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Current Study Context */}
                {currentPlan && (
                    <div className="flex items-center gap-2 border-b border-slate-100 bg-emerald-50/60 px-5 py-2.5">
                        <BookOpen className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                        <span className="truncate text-xs font-medium text-emerald-900">
                            Studying: {String(currentPlan.subject || "Current plan")}
                        </span>
                    </div>
                )}

                {/* Messages */}
                <div
                    ref={scrollRef}
                    className="flex-1 space-y-5 overflow-y-auto bg-slate-50/70 px-4 py-5"
                >
                    {messages.map((message, index) => (
                        <div
                            key={index}
                            className={`flex gap-2.5 ${message.role === "user"
                                ? "justify-end"
                                : "justify-start"
                                }`}
                        >
                            {message.role === "assistant" && (
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                                    <Sparkles className="h-3.5 w-3.5" />
                                </div>
                            )}

                            <div
                                className={`max-w-[88%] rounded-2xl px-3.5 py-3 text-[13px] leading-relaxed ${message.role === "user"
                                    ? "rounded-br-sm bg-emerald-600 text-white"
                                    : "rounded-tl-sm border border-slate-200 bg-white text-slate-800 shadow-sm"
                                    }`}
                            >
                                {message.role === "assistant" ? (
                                    <div className="prose prose-sm max-w-none break-words prose-headings:font-bold prose-headings:text-slate-900 prose-p:my-2 prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:bg-slate-900 prose-pre:p-3 prose-pre:text-xs prose-code:rounded prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-emerald-800 prose-code:before:content-none prose-code:after:content-none prose-a:text-emerald-700 prose-li:my-1 prose-table:text-xs">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {message.content}
                                        </ReactMarkdown>
                                    </div>
                                ) : (
                                    <p className="whitespace-pre-wrap">{message.content}</p>
                                )}
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                                <Sparkles className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                                Thinking...
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                            {error}
                            <button
                                type="button"
                                onClick={() => void sendMessage(messages[messages.length - 1]?.content || "")}
                                className="ml-2 font-semibold underline"
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    {messages.length === 1 && !isLoading && (
                        <div className="space-y-2 pl-9">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                Try asking
                            </p>
                            {STARTER_QUESTIONS.map((question) => (
                                <button
                                    key={question}
                                    type="button"
                                    onClick={() => void sendMessage(question)}
                                    className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-xs text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                                >
                                    {question}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Composer */}
                <form
                    onSubmit={handleSubmit}
                    className="border-t border-slate-200 bg-white p-4"
                >
                    <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 transition focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            onKeyDown={(event) => {
                                if (
                                    event.key === "Enter" &&
                                    !event.shiftKey &&
                                    !event.nativeEvent.isComposing
                                ) {
                                    event.preventDefault();
                                    event.currentTarget.form?.requestSubmit();
                                }
                            }}
                            placeholder="Ask your doubt..."
                            rows={1}
                            disabled={isLoading}
                            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60"
                        />

                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Send message"
                        >
                            <Send className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between px-1">
                        <span className="text-[10px] text-slate-400">
                            <MessageCircle className="mr-1 inline h-3 w-3" />
                            Adaptive AI tutoring
                        </span>
                        <span className="text-[10px] text-slate-400">
                            Enter to send · Shift + Enter for newline
                        </span>
                    </div>
                </form>
            </div>
        </>
    );
}
