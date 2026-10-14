"use client";

// 화면 간에 공유하는 상태(일정, 할일 완료). Supabase 연결 시 이 훅의 구현만 쿼리·뮤테이션으로 교체한다.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { INITIAL_EVENTS, INITIAL_TODOS, INITIAL_TRANSACTIONS } from "./mock-data";
import type { CalendarEvent, EventInput, Todo, Transaction } from "./types";

interface Store {
  events: CalendarEvent[];
  todos: Todo[];
  transactions: Transaction[];
  saveEvent: (id: string | null, input: EventInput) => void;
  deleteEvent: (id: string) => void;
  toggleTodo: (id: string) => void;
}

const StoreContext = createContext<Store | null>(null);

const sortKey = (e: CalendarEvent) => `${e.date} ${e.allDay ? "" : e.start}`;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [todos, setTodos] = useState(INITIAL_TODOS);

  const saveEvent = useCallback((id: string | null, input: EventInput) => {
    setEvents((list) => {
      const next = id
        ? list.map((e) => (e.id === id ? { ...input, id } : e))
        : [...list, { ...input, id: `ev-${crypto.randomUUID()}` }];
      return next.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    });
  }, []);

  const deleteEvent = useCallback((id: string) => {
    setEvents((list) => list.filter((e) => e.id !== id));
  }, []);

  const toggleTodo = useCallback((id: string) => {
    setTodos((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }, []);

  const value = useMemo(
    () => ({ events, todos, transactions: INITIAL_TRANSACTIONS, saveEvent, deleteEvent, toggleTodo }),
    [events, todos, saveEvent, deleteEvent, toggleTodo],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore는 StoreProvider 안에서만 사용할 수 있습니다.");
  return store;
}

export const eventsOn = (events: CalendarEvent[], date: string) => events.filter((e) => e.date === date);
