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
        <CommandGroup heading="Suggestions">
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/dashboard" }))}>
            <Search className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/leads" }))}>
            <Users className="mr-2 h-4 w-4" />
            <span>Leads</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/pipeline" }))}>
            <GitPullRequest className="mr-2 h-4 w-4" />
            <span>Sales Pipeline</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/settings" }))}>
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
            <CommandShortcut>⌘P</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/settings/integrations" }))}>
            <Zap className="mr-2 h-4 w-4" />
            <span>Integrations</span>
            <CommandShortcut>⌘I</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/settings" }))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
