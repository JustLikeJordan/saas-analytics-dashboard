export interface ServiceStatus {
  status: 'ok' | 'degraded' | 'error';
  latencyMs: number;
}

export interface SystemHealth {
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    claude: ServiceStatus;
  };
  uptime: {
    seconds: number;
    formatted: string;
  };
  timestamp: string;
}
