import * as React from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"

import { cn } from "@/src/lib/utils"
import { Button } from "@/src/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/src/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/src/components/ui/popover"
import { Input } from "@/src/components/ui/input"

const countries = [
    { value: "ML", label: "Mali", code: "+223", flag: "🇲🇱" },
    { value: "BF", label: "Burkina Faso", code: "+226", flag: "🇧🇫" },
    { value: "SN", label: "Sénégal", code: "+221", flag: "🇸🇳" },
    { value: "CI", label: "Côte d'Ivoire", code: "+225", flag: "🇨🇮" },
    { value: "CM", label: "Cameroun", code: "+237", flag: "🇨🇲" },
    { value: "MA", label: "Maroc", code: "+212", flag: "🇲🇦" },
    { value: "DZ", label: "Algérie", code: "+213", flag: "🇩🇿" },
    { value: "TN", label: "Tunisie", code: "+216", flag: "🇹🇳" },
    { value: "NE", label: "Niger", code: "+227", flag: "🇳🇪" },
    { value: "TG", label: "Togo", code: "+228", flag: "🇹🇬" },
]

interface PhoneInputProps {
    value: string
    onChange: (value: string) => void
    disabled?: boolean
    className?: string
}

export function PhoneInput({ value, onChange, disabled, className }: PhoneInputProps) {
    const [open, setOpen] = React.useState(false)

    // Parse value to find country code
    // Default to France if empty or no match, or fallback to first country
    const defaultCountry = countries.find(c => value?.startsWith(c.code)) || countries.find(c => c.value === "FR") || countries[0]
    const [selectedCountry, setSelectedCountry] = React.useState(defaultCountry)

    // Extract number part
    const [phoneNumber, setPhoneNumber] = React.useState(
        value?.startsWith(selectedCountry.code)
            ? value.slice(selectedCountry.code.length)
            : value || ""
    )

    const handleCountrySelect = (currentValue: string) => {
        const country = countries.find((c) => c.value === currentValue)
        if (country) {
            setSelectedCountry(country)
            setOpen(false)
            // Update parent value
            onChange(country.code + phoneNumber)
        }
    }

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value.replace(/\D/g, '') // Only numbers
        setPhoneNumber(newVal)
        onChange(selectedCountry.code + newVal)
    }

    // Sync internal state if external value changes abruptly
    React.useEffect(() => {
        if (value && !value.startsWith(selectedCountry.code)) {
            // Try to detect new code
            const match = countries.find(c => value.startsWith(c.code));
            if (match) {
                setSelectedCountry(match);
                setPhoneNumber(value.slice(match.code.length));
            }
        }
    }, [value, selectedCountry.code])


    return (
        <div className={cn("flex gap-2", className)}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-[140px] justify-between"
                        disabled={disabled}
                        type="button"
                    >
                        <span className="flex items-center gap-2 truncate">
                            <span className="text-lg">{selectedCountry.flag}</span>
                            <span className="text-muted-foreground">{selectedCountry.code}</span>
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                        <CommandInput placeholder="Rechercher un pays..." />
                        <CommandList>
                            <CommandEmpty>Aucun pays trouvé.</CommandEmpty>
                            <CommandGroup>
                                {countries.map((country) => (
                                    <CommandItem
                                        key={country.value}
                                        value={country.value}
                                        onSelect={handleCountrySelect}
                                        keywords={[country.label, country.code, country.value]}
                                        className="cursor-pointer"
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                selectedCountry.value === country.value ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        <span className="mr-2 text-lg">{country.flag}</span>
                                        <span className="flex-1">{country.label}</span>
                                        <span className="text-muted-foreground tabular-nums">{country.code}</span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            <Input
                type="tel"
                placeholder="6 12 34 56 78"
                value={phoneNumber}
                onChange={handlePhoneChange}
                disabled={disabled}
                className="flex-1"
            />
        </div>
    )
}
