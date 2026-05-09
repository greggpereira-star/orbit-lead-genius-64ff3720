 import React from 'react';
 import ReactECharts from 'echarts-for-react';
 
 interface SankeyNode {
   name: string;
 }
 
 interface SankeyLink {
   source: string;
   target: string;
   value: number;
 }
 
 interface SankeyChartProps {
   data: {
     nodes: SankeyNode[];
     links: SankeyLink[];
   };
 }
 
 export const SankeyChart: React.FC<SankeyChartProps> = ({ data }) => {
   const option = {
     tooltip: {
       trigger: 'item',
       triggerOn: 'mousemove'
     },
     series: [
       {
         type: 'sankey',
         data: data.nodes,
         links: data.links,
         emphasis: {
           focus: 'adjacency'
         },
         lineStyle: {
           color: 'gradient',
           curveness: 0.5,
           opacity: 0.4
         },
         label: {
           fontSize: 12,
           color: '#425466',
           fontFamily: 'Inter'
         },
         itemStyle: {
           borderWidth: 1,
           borderColor: '#aaa'
         }
       }
     ]
   };
 
   return <ReactECharts option={option} style={{ height: '400px', width: '100%' }} />;
 };