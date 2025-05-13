export type ArtworkArchiveRecord = {
  'Piece Id': string;
  'Name': string;
  'Artist(s)': string;
  'Type': string;
  'Medium': string;
  'Height': string;
  'Width': string;
  'Depth': string;
  'Price': string;
  'Description': string;
  'Status': string;
  'Primary Image Url': string;
  'Creation Date': string;
  'Tags': string;
  'Current Location Name': string;
  [key: string]: string;
}

export type ShopifyProductRecord = {
  Handle: string;
  Title: string;
  'Body (HTML)': string;
  Vendor: string;
  'Product Category': string;
  Type: string;
  Tags: string;
  Published: string;
  'Option1 Name': string;
  'Option1 Value': string;
  'Option2 Name': string;
  'Option2 Value': string;
  'Option3 Name': string;
  'Option3 Value': string;
  'Variant SKU': string;
  'Variant Price': string;
  'Variant Inventory Qty': string;
  'Image Src': string;
  'Image Position': string;
  'Image Alt Text': string;
  Status: string;
  [key: string]: string;
}