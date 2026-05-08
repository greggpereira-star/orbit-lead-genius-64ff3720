import React from 'react';
import ReactECharts from 'echarts-for-react';

interface LeadFunnelChartProps {
  data: { value: number; name: string }[];
}

export function LeadFunnelChart({ data }: LeadFunnelChartProps) {
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b} : {c}'
    },
    series: [
      {
        name: 'Funnel',
        type: 'funnel',
        left: '10%',
        top: 60,
        bottom: 60,
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
          formatter: '{b}: {c}',
          color: '#fff',
          fontSize: 12,
          fontWeight: 'bold'
        },
        labelLine: {
          show: false
        },
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 1
        },
        emphasis: {
          label: {
            fontSize: 20
          }
        },
        data: data
      }
    ],
    color: ['#0a2540', '#635bff', '#00d4ff', '#f6f9fc', '#425466']
  };

  return (
    <div className="w-full h-[400px]">
      <ReactECharts 
        option={option} 
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'svg' }}
      />
    </div>
  );
}
