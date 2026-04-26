"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { Shield, AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
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
    console.error(`[ErrorBoundary: ${this.props.name || 'Unknon'}]`, error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="p-8 my-4 rounded-3xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-xl bg-rose-500 shadow-lg shadow-rose-500/30 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-xl font-bold cc-text-primary">Lo sentimos, hubo un error en este módulo</h2>
          <p className="text-sm cc-text-secondary max-w-sm mx-auto">
            {this.props.name ? `El módulo "${this.props.name}"` : 'Esta sección'} no pudo cargarse correctamente.
          </p>
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
