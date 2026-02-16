import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Result, Card, Typography } from 'antd';

const { Text, Paragraph } = Typography;

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          minHeight: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: 24,
          background: '#f5f5f5'
        }}>
          <Card style={{ maxWidth: 600, width: '100%' }}>
            <Result
              status="error"
              title="Произошла ошибка"
              subTitle="К сожалению, произошла непредвиденная ошибка. Попробуйте перезагрузить страницу."
              extra={[
                <Button type="primary" key="reload" onClick={this.handleReload}>
                  Перезагрузить страницу
                </Button>,
                <Button key="home" onClick={this.handleGoHome}>
                  На главную
                </Button>,
              ]}
            >
              {this.state.error && (
                <div style={{ 
                  textAlign: 'left', 
                  marginTop: 24,
                  padding: 16,
                  background: '#fff2f0',
                  borderRadius: 8
                }}>
                  <Paragraph>
                    <Text strong>Ошибка: </Text>
                    <Text code>{this.state.error.message}</Text>
                  </Paragraph>
                  {this.state.errorInfo && (
                    <Paragraph>
                      <Text strong>Стек вызовов:</Text>
                      <pre style={{ 
                        fontSize: 12, 
                        overflow: 'auto', 
                        maxHeight: 200,
                        background: '#fafafa',
                        padding: 8,
                        borderRadius: 4
                      }}>
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </Paragraph>
                  )}
                </div>
              )}
            </Result>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
