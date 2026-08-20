import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram, Gauge } from 'prom-client';

export interface RecordHttpRequestParams {
  method: string;
  route: string;
  statusCode: number;
  country?: string;
  durationSeconds: number;
}

@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('http_requests_total')
    private readonly requestsCounter: Counter<string>,
    @InjectMetric('http_request_duration_seconds')
    private readonly durationHistogram: Histogram<string>,
    @InjectMetric('http_active_requests')
    private readonly activeRequestsGauge: Gauge<string>,
  ) {}

  incrementActiveRequests(method: string): void {
    this.activeRequestsGauge.inc({ method: method.toUpperCase() });
  }

  decrementActiveRequests(method: string): void {
    this.activeRequestsGauge.dec({ method: method.toUpperCase() });
  }

  recordHttpRequest(params: RecordHttpRequestParams): void {
    const { method, route, statusCode, country = 'Unknown', durationSeconds } = params;
    const statusClass = `${Math.floor(statusCode / 100)}xx`;
    const cleanRoute = route || 'unmatched';
    const cleanMethod = method.toUpperCase();

    this.requestsCounter.inc({
      method: cleanMethod,
      route: cleanRoute,
      status_code: statusCode.toString(),
      status_class: statusClass,
      country: country || 'Unknown',
    });

    this.durationHistogram.observe(
      {
        method: cleanMethod,
        route: cleanRoute,
        status_code: statusCode.toString(),
      },
      durationSeconds,
    );
  }
}
