import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white p-8">
          <div className="max-w-2xl w-full bg-red-50 border-4 border-red-200 rounded-lg p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
                <i className="fas fa-exclamation-triangle text-white text-xl"></i>
              </div>
              <h1 className="text-2xl font-black text-red-900 uppercase">Application Error</h1>
            </div>
            
            <div className="space-y-4 text-red-800">
              <p className="font-bold">Something went wrong. Please check the following:</p>
              
              <div className="bg-white p-4 rounded border border-red-200">
                <h2 className="font-black uppercase text-sm mb-2">Common Issues:</h2>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Check that <code className="bg-red-100 px-1 rounded">VITE_SUPABASE_URL</code> is set in Vercel</li>
                  <li>Check that <code className="bg-red-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> is set in Vercel</li>
                  <li>Verify your Supabase database tables are created (see database-schema.sql)</li>
                  <li>Check browser console for detailed error messages</li>
                </ul>
              </div>

              {this.state.error && (
                <div className="bg-white p-4 rounded border border-red-200">
                  <h2 className="font-black uppercase text-sm mb-2">Error Details:</h2>
                  <pre className="text-xs overflow-auto bg-red-50 p-2 rounded">
                    {this.state.error.toString()}
                  </pre>
                </div>
              )}

              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="bg-red-600 text-white px-6 py-3 rounded font-black uppercase hover:bg-red-700 transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

