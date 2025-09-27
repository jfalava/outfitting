#!/bin/bash
set -e  # Exit on any error

echo "Starting package sorting..."

# Flag to track if any changes were made
changed=false

# Sort and deduplicate TXT files in packages/
echo "Sorting TXT files in packages/..."
while IFS= read -r -d '' txt_file; do
  if [[ -f "$txt_file" ]]; then
    # Sort unique (alphabetical, case-sensitive) and replace if changed
    sort -u "$txt_file" > "${txt_file}.tmp"
    if ! cmp -s "$txt_file" "${txt_file}.tmp"; then
      mv "${txt_file}.tmp" "$txt_file"
      echo "Sorted $txt_file"
      changed=true
    else
      rm "${txt_file}.tmp"
    fi
  fi
done < <(find packages -name "*.txt" -type f -print0 2>/dev/null)

# Sort packages in flake.nix (pure bash: find list, extract, sort, rewrite)
echo "Sorting packages in packages/x64-linux/flake.nix..."
flake_path="packages/x64-linux/flake.nix"
if [[ ! -f "$flake_path" ]]; then
  echo "Flake file not found, skipping."
else
  # Backup original
  cp "$flake_path" "${flake_path}.bak"

  # Find start line: contains 'paths =' and '['
  start_line=$(awk '/paths\s*=\s*with.*\[/{print NR; exit}' "$flake_path")
  if [[ -z "$start_line" ]]; then
    echo "No 'paths =' list found in flake.nix, skipping."
  else
    # Find end line: contains '];' (end of list)
    end_line=$(awk -v start="$start_line" 'NR >= start && /];/{print NR; exit}' "$flake_path")
    if [[ -z "$end_line" ]]; then
      echo "No closing '];' found after paths list, skipping."
    else
      # Extract list items (lines between start+1 and end-1, non-empty, no leading/trailing whitespace)
      # Use awk to get indented package lines (e.g., '  bat,')
      mapfile -t list_items < <(sed -n "$((start_line + 1)),$((end_line - 1))p" "$flake_path" | \
        awk 'NF > 0 && !/^[ \t]*#/ {print}' | \
        sort -k1 -t' ' -b)  # Sort by first word (package name), ignoring leading spaces

      if [[ ${#list_items[@]} -eq 0 ]]; then
        echo "No package items found in list, skipping."
      else
        # Rebuild file: header up to start, sorted items, end line, footer
        {
          sed "$((end_line + 1)),\$p" "$flake_path" | sed '1d'  # Footer (from end+1)
          echo "${list_items[*]}"  # Sorted items (each on new line)
          sed -n "$end_line p" "$flake_path"  # End line ('] ;')
          sed -n "1,$(($start_line))p" "$flake_path" | tac | sed '1d' | tac  # Header up to start (reversed to preserve order)
        } | tac > "${flake_path}.tmp"

        # Wait, that was messy—better way: use sed to replace the block
        # First, create temp with sorted block
        printf '\n'  # Newline after start
        printf '%s\n' "${list_items[@]}"
        printf '%s\n' "$(sed -n "$end_line p" "$flake_path")"  # ]; line

        # Now, replace the block in original
        sed -i.bak "$start_line,\$((end_line))d" "$flake_path"  # Remove old block
        sed -i "$start_line r ${flake_path}.tmp" "$flake_path"  # Insert new block after start line
        rm "${flake_path}.tmp" "${flake_path}.bak"

        # Check if changed
        if ! cmp -s "${flake_path}.bak" "$flake_path"; then
          echo "Sorted flake.nix"
          changed=true
        fi
        rm "${flake_path}.bak"
      fi
    fi
  fi
fi

# Summary
if [[ $changed == true ]]; then
  echo "Changes applied! Run 'git add . && git commit' to update your repo."
  git diff --name-only  # Show changed files
else
  echo "No changes needed—all files are already sorted."
fi
