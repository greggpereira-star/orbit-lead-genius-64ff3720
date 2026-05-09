import * as React from "react"
import {
  Calculator,
  Calendar,
  CreditCard,
  Settings,
  Smile,
  User,
  Search,
  Users,
  GitPullRequest,
   Zap,
   PlusCircle,
   LayoutDashboard,
   Settings2,
   Database,
   LogOut
} from "lucide-react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useNavigate } from "@tanstack/react-router"

export function CommandPalette() {
  const [open, setOpen] = React.useState(false)
  const navigate = useNavigate()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const runCommand = (command: () => void) => {
    setOpen(false)
    command()
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
         <CommandGroup heading="Quick Actions">
           <CommandItem onSelect={() => runCommand(() => navigate({ to: "/leads" }))}>
             <PlusCircle className="mr-2 h-4 w-4" />
             <span>Create New Lead</span>
             <CommandShortcut>⌘N</CommandShortcut>
           </CommandItem>
           <CommandItem onSelect={() => runCommand(() => setOpen(false))}>
             <Zap className="mr-2 h-4 w-4 text-amber-500" />
             <span>Run Automation Audit</span>
           </CommandItem>
         </CommandGroup>
         <CommandSeparator />
         <CommandGroup heading="Navigation">
           <CommandItem onSelect={() => runCommand(() => navigate({ to: "/dashboard" }))}>
             <LayoutDashboard className="mr-2 h-4 w-4" />
             <span>Dashboard</span>
           </CommandItem>
           <CommandItem onSelect={() => runCommand(() => navigate({ to: "/leads" }))}>
             <Users className="mr-2 h-4 w-4" />
             <span>Leads & CDP</span>
           </CommandItem>
           <CommandItem onSelect={() => runCommand(() => navigate({ to: "/pipeline" }))}>
             <GitPullRequest className="mr-2 h-4 w-4" />
             <span>Sales Pipeline</span>
           </CommandItem>
           <CommandItem onSelect={() => runCommand(() => navigate({ to: "/analytics" }))}>
             <Search className="mr-2 h-4 w-4" />
             <span>Intelligence & Analytics</span>
           </CommandItem>
         </CommandGroup>
         <CommandSeparator />
         <CommandGroup heading="Configuration">
           <CommandItem onSelect={() => runCommand(() => navigate({ to: "/settings/integrations" }))}>
             <Database className="mr-2 h-4 w-4" />
             <span>Integrations</span>
             <CommandShortcut>⌘I</CommandShortcut>
           </CommandItem>
           <CommandItem onSelect={() => runCommand(() => navigate({ to: "/settings" }))}>
             <Settings2 className="mr-2 h-4 w-4" />
             <span>Global Settings</span>
             <CommandShortcut>⌘S</CommandShortcut>
           </CommandItem>
           <CommandItem onSelect={() => runCommand(() => {
             toast.info("Logging out...");
             navigate({ to: "/login" });
           })}>
             <LogOut className="mr-2 h-4 w-4 text-rose-500" />
             <span>Logout</span>
           </CommandItem>
         </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
