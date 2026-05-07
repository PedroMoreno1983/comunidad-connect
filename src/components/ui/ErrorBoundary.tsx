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
    console.error(`[ErrorBoundary: ${this.props.name || 'Unknown'}]`, error, errorInfo);
  }

  public componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const showDetails =
        process.env.NODE_ENV !== "production" ||
        (typeof window !== "undefined" && window.location.hostname.includes("vercel.app"));
      const errorMessage = this.state.error?.message;

      return (
        <div className="p-8 my-4 rounded-3xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-xl bg-rose-500 shadow-lg shadow-rose-500/30 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-xl font-bold cc-text-primary">Lo sentimos, hubo un error en este módulo</h2>
          <p className="text-sm cc-text-secondary max-w-sm mx-auto">
            {this.props.name ? `El módulo "${this.props.name}"` : 'Esta sección'} no pudo cargarse correctamente.
          </p>
          {showDetails && errorMessage && (
            <p className="mx-auto max-w-xl rounded-2xl bg-white/70 px-4 py-3 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
              Detalle tecnico: {errorMessage}
            </p>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold shadow-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Intentar de nuevo
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
