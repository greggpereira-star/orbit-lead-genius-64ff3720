 import { useEffect, useState } from 'react';
 import { initTracking, getStoredTracking, TrackingData } from '@/core/tracking/pixel';
 
 export function useTracking() {
   const [tracking, setTracking] = useState<TrackingData | null>(null);
 
   useEffect(() => {
     const data = initTracking();
     setTracking(data);
   }, []);
 
   return {
     tracking,
     getStoredTracking,
   };
 }