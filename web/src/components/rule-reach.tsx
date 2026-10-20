import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

/**
 * Where a rule applies. For a shared rule the text is fixed and the same for every space, so it
 * reveals nothing about the closed spaces underneath. A rule in your personal space follows you
 * everywhere. Without onOnlyHereChange it only says where the rule applies, or, when it is being
 * removed, where it stops applying.
 */
export function RuleReach({ id, space, shared = true, personal = false, onlyHere, onOnlyHereChange, removing, disabled }: {
  id: string;
  space: string;
  shared?: boolean;
  personal?: boolean;
  onlyHere: boolean;
  onOnlyHereChange?: (value: boolean) => void;
  removing?: boolean;
  disabled?: boolean;
}) {
  const where = reachOf({ space, shared, personal, onlyHere, removing });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{where}</p>
      {onOnlyHereChange && !personal && (
        <div className="flex items-center gap-2.5">
          <Checkbox id={id} checked={onlyHere} onCheckedChange={(value) => onOnlyHereChange(value === true)} disabled={disabled} />
          <Label htmlFor={id} className="text-sm font-normal">Only in {space}</Label>
        </div>
      )}
    </div>
  );
}

function reachOf({ space, shared, personal, onlyHere, removing }: { space: string; shared: boolean; personal: boolean; onlyHere: boolean; removing?: boolean }) {
  if (removing) {
    if (personal) return onlyHere ? 'It stops applying in your personal space.' : 'It stops following you into the spaces you work in.';
    if (shared) return onlyHere ? `It stops applying in ${space}.` : `It stops applying in ${space} and every space under it, including spaces you can’t open.`;
    return onlyHere ? `It stops applying to you in ${space}.` : `It stops applying to you in ${space} and the spaces under it.`;
  }
  if (personal) return onlyHere ? 'It applies only in your personal space, not in the spaces under it.' : 'It follows you into every space you work in.';
  if (shared) return onlyHere ? `It applies only in ${space}, not in the spaces under it.` : `It applies to ${space} and every space under it, including spaces you can’t open.`;
  return onlyHere ? `It applies to you only in ${space}, not in the spaces under it.` : `It applies to you in ${space} and every space under it.`;
}
