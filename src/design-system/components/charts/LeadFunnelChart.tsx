import React from 'react';
import ReactECharts from 'echarts-for-react';

interface FunnelData {
  value: number;
  name: string;
}

interface LeadFunnelChartProps {
  data: FunnelData[];
}

export function LeadFunnelChart({ data }: LeadFunnelChartProps) {
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b} : {c}%'
    },
    series: [
      {
        name: 'Funnel',
        type: 'funnel',
        left: '10%',
        top: 20,
        bottom: 20,
        width: '80%',
        min: 0,
        max: 100,
        minSize: '0%',
        maxSize: '100%',
        sort: 'descending',
        gap: 2,
        label: {
          show: true,
          position: 'inside',
          color: '#fff',
          fontSize: 12,
          fontWeight: 'bold'
        },
        labelLine: {
          show: false
        },
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 1,
          borderRadius: 8
        },
        emphasis: {
          label: {
            fontSize: 14
          }
        },
        data: data
      }
    ]
  };

  return <ReactECharts option={option} style={{ height: '350px', width: '100%' }} />;
}
