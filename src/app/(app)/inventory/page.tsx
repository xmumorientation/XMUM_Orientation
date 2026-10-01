"use client";

import { useCallback, useState } from "react";
import { BlindBoxInventory } from "@/components/inventory/BlindBoxInventory";
import { PuzzleInventory } from "@/components/inventory/PuzzleInventory";
import { TokenSummary } from "@/components/inventory/TokenSummary";
import { useCurrentUserContext } from "@/components/ProfileProvider";
import { EmptyState, PageTitle } from "@/components/ui";

export default function InventoryPage(){
  const currentUser=useCurrentUserContext(),[groupName,setGroupName]=useState<string|null>(null);
  const receiveGroup=useCallback((summary:{group_name:string})=>setGroupName(summary.group_name),[]);
  if(!currentUser.groupId)return <div><PageTitle title="Inventory"/><EmptyState title="Group not assigned" message="Your group has not been assigned yet."/></div>;
  return <div className="space-y-4"><PageTitle title="Inventory" subtitle={groupName??`Group ${currentUser.groupId}`}/><TokenSummary onGroupLoaded={receiveGroup}/><PuzzleInventory groupId={currentUser.groupId} groupName={groupName??undefined}/><BlindBoxInventory/></div>;
}
