 import { createFileRoute } from '@tanstack/react-router';
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
 import { Search, Send, Phone, Video, MoreVertical, Paperclip, Smile } from 'lucide-react';
 
 export const Route = createFileRoute('/_app/whatsapp')({
   component: WhatsAppPage,
 });
 
 const mockChats = [
   { id: 1, name: 'John Doe', lastMessage: 'Thanks for the info!', time: '10:30', unread: 2, online: true },
   { id: 2, name: 'Jane Smith', lastMessage: 'When can we talk?', time: '09:15', unread: 0, online: false },
   { id: 3, name: 'Robert Fox', lastMessage: 'Attached the proposal.', time: 'Yesterday', unread: 0, online: true },
 ];
 
 function WhatsAppPage() {
   return (
     <div className="h-[calc(100vh-120px)] border rounded-xl bg-card shadow-sm overflow-hidden flex">
       {/* Sidebar */}
       <div className="w-80 border-r flex flex-col bg-muted/10">
         <div className="p-4 border-b space-y-4">
           <div className="flex items-center justify-between">
             <h2 className="font-bold text-lg">WhatsApp</h2>
             <Button variant="ghost" size="icon" className="h-8 w-8">
               <MoreVertical className="h-4 w-4" />
             </Button>
           </div>
           <div className="relative">
             <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
             <Input placeholder="Search messages..." className="pl-9 h-9" />
           </div>
         </div>
         <div className="flex-1 overflow-auto">
           {mockChats.map((chat) => (
             <div 
               key={chat.id} 
               className={`p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/50 transition-colors ${chat.id === 1 ? 'bg-primary/5 border-l-2 border-primary' : ''}`}
             >
               <div className="relative">
                 <Avatar className="h-12 w-12 border">
                   <AvatarFallback>{chat.name.substring(0, 2)}</AvatarFallback>
                 </Avatar>
                 {chat.online && (
                   <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" />
                 )}
               </div>
               <div className="flex-1 min-w-0">
                 <div className="flex justify-between items-baseline mb-0.5">
                   <h4 className="font-semibold text-sm truncate">{chat.name}</h4>
                   <span className="text-[10px] text-muted-foreground">{chat.time}</span>
                 </div>
                 <div className="flex justify-between items-center">
                   <p className="text-xs text-muted-foreground truncate">{chat.lastMessage}</p>
                   {chat.unread > 0 && (
                     <span className="h-4 w-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center font-bold">
                       {chat.unread}
                     </span>
                   )}
                 </div>
               </div>
             </div>
           ))}
         </div>
       </div>
 
       {/* Chat Area */}
       <div className="flex-1 flex flex-col bg-background">
         <div className="p-4 border-b flex items-center justify-between bg-card">
           <div className="flex items-center gap-3">
             <Avatar className="h-10 w-10">
               <AvatarFallback>JD</AvatarFallback>
             </Avatar>
             <div>
               <h4 className="font-semibold text-sm">John Doe</h4>
               <p className="text-[10px] text-emerald-500 font-medium">Online</p>
             </div>
           </div>
           <div className="flex items-center gap-1">
             <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground">
               <Video className="h-4 w-4" />
             </Button>
             <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground">
               <Phone className="h-4 w-4" />
             </Button>
             <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground">
               <MoreVertical className="h-4 w-4" />
             </Button>
           </div>
         </div>
 
         <div className="flex-1 overflow-auto p-6 space-y-4 bg-muted/5">
           <div className="flex justify-center">
             <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground bg-muted px-2 py-1 rounded">Today</span>
           </div>
           <div className="flex justify-end">
             <div className="max-w-[70%] bg-primary text-primary-foreground p-3 rounded-2xl rounded-tr-none shadow-sm">
               <p className="text-sm">Hi John, I saw you were looking at our pricing page. Do you have any questions?</p>
               <p className="text-[9px] text-right mt-1 opacity-70">10:25 AM</p>
             </div>
           </div>
           <div className="flex justify-start">
             <div className="max-w-[70%] bg-card border p-3 rounded-2xl rounded-tl-none shadow-sm">
               <p className="text-sm">Hi! Yes, I was interested in the Enterprise plan for 200+ users. Thanks for reaching out!</p>
               <p className="text-[9px] text-right mt-1 text-muted-foreground">10:30 AM</p>
             </div>
           </div>
         </div>
 
         <div className="p-4 border-t bg-card">
           <div className="flex items-center gap-2">
             <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground shrink-0">
               <Paperclip className="h-5 w-5" />
             </Button>
             <div className="relative flex-1">
               <Input placeholder="Type a message..." className="pr-10 bg-muted/50 border-none h-11" />
               <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-9 w-9 text-muted-foreground">
                 <Smile className="h-5 w-5" />
               </Button>
             </div>
             <Button className="h-11 w-11 rounded-full shrink-0">
               <Send className="h-5 w-5" />
             </Button>
           </div>
         </div>
       </div>
     </div>
   );
 }