"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary: ${this.props.name || "Unknown"}]`, error, errorInfo);
  }

  public componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const showDetails = process.env.NODE_ENV !== "production";
      const errorMessage = this.state.error?.message;

      return (
        <div className="my-4 rounded-lg border border-subtle bg-surface p-6 text-left shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-danger-border bg-danger-bg text-danger-fg">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold cc-text-primary">Este módulo no pudo cargarse</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 cc-text-secondary">
                  {this.props.name
                    ? `El módulo "${this.props.name}" encontró un problema.`
                    : "Esta sección encontró un problema."}{" "}
                  Puedes reintentar sin salir de la pantalla.
                </p>
              </div>
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              <RefreshCw className="h-4 w-4" />
              Intentar de nuevo
            </button>
          </div>
          {showDetails && errorMessage && (
            <details className="mt-5 rounded-md border border-subtle bg-elevated px-4 py-3 text-xs cc-text-secondary">
              <summary className="cursor-pointer font-semibold cc-text-primary">Detalle técnico</summary>
              <p className="mt-2 break-words font-mono">{errorMessage}</p>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
